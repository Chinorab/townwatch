// Key-value store behind every cache, job, counter and the budget ledger.
// Production: Upstash Redis. Local CLI: JSON files in .cache/kv. Tests: memory.
import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";

export interface KV {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlSec?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** Atomic increment; sets the TTL when the key is created. */
  incr(key: string, ttlSec?: number): Promise<number>;
  incrByFloat(key: string, by: number): Promise<number>;
  /** Set only if absent, with expiry. Returns true when acquired. */
  setNx(key: string, value: string, ttlMs: number): Promise<boolean>;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

interface Entry {
  v: unknown;
  exp: number | null;
}

export class MemoryKV implements KV {
  private m = new Map<string, Entry>();
  private live(key: string): Entry | undefined {
    const e = this.m.get(key);
    if (e && e.exp !== null && e.exp < Date.now()) {
      this.m.delete(key);
      return undefined;
    }
    return e;
  }
  async get<T>(key: string) {
    return (this.live(key)?.v as T) ?? null;
  }
  async set(key: string, value: unknown, ttlSec?: number) {
    this.m.set(key, { v: structuredClone(value), exp: ttlSec ? Date.now() + ttlSec * 1000 : null });
  }
  async del(key: string) {
    this.m.delete(key);
  }
  async incr(key: string, ttlSec?: number) {
    const e = this.live(key);
    const n = ((e?.v as number) ?? 0) + 1;
    this.m.set(key, { v: n, exp: e?.exp ?? (ttlSec ? Date.now() + ttlSec * 1000 : null) });
    return n;
  }
  async incrByFloat(key: string, by: number) {
    const n = ((this.live(key)?.v as number) ?? 0) + by;
    this.m.set(key, { v: n, exp: null });
    return n;
  }
  async setNx(key: string, value: string, ttlMs: number) {
    if (this.live(key)) return false;
    this.m.set(key, { v: value, exp: Date.now() + ttlMs });
    return true;
  }
}

/** One JSON file per key. Single-process use only (CLI and local dev). */
export class FileKV implements KV {
  constructor(private readonly dir = join(process.cwd(), ".cache", "kv")) {
    mkdirSync(dir, { recursive: true });
  }
  private path(key: string) {
    return join(this.dir, key.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 180) + ".json");
  }
  private read(key: string): Entry | undefined {
    const p = this.path(key);
    if (!existsSync(p)) return undefined;
    const e = JSON.parse(readFileSync(p, "utf8")) as Entry;
    if (e.exp !== null && e.exp < Date.now()) {
      rmSync(p, { force: true });
      return undefined;
    }
    return e;
  }
  private write(key: string, e: Entry) {
    writeFileSync(this.path(key), JSON.stringify(e));
  }
  async get<T>(key: string) {
    return (this.read(key)?.v as T) ?? null;
  }
  async set(key: string, value: unknown, ttlSec?: number) {
    this.write(key, { v: value, exp: ttlSec ? Date.now() + ttlSec * 1000 : null });
  }
  async del(key: string) {
    rmSync(this.path(key), { force: true });
  }
  async incr(key: string, ttlSec?: number) {
    const e = this.read(key);
    const n = ((e?.v as number) ?? 0) + 1;
    this.write(key, { v: n, exp: e?.exp ?? (ttlSec ? Date.now() + ttlSec * 1000 : null) });
    return n;
  }
  async incrByFloat(key: string, by: number) {
    const n = ((this.read(key)?.v as number) ?? 0) + by;
    this.write(key, { v: n, exp: null });
    return n;
  }
  async setNx(key: string, value: string, ttlMs: number) {
    if (this.read(key)) return false;
    this.write(key, { v: value, exp: Date.now() + ttlMs });
    return true;
  }
}

export async function redisKV(url: string, token: string): Promise<KV> {
  const { Redis } = await import("@upstash/redis");
  const r = new Redis({ url, token });
  return {
    async get<T>(key: string) {
      return ((await r.get(key)) as T) ?? null;
    },
    async set(key, value, ttlSec) {
      if (ttlSec) await r.set(key, value, { ex: ttlSec });
      else await r.set(key, value);
    },
    async del(key) {
      await r.del(key);
    },
    async incr(key, ttlSec) {
      const n = await r.incr(key);
      if (n === 1 && ttlSec) await r.expire(key, ttlSec);
      return n;
    },
    async incrByFloat(key, by) {
      return Number(await r.incrbyfloat(key, by));
    },
    async setNx(key, value, ttlMs) {
      return (await r.set(key, value, { nx: true, px: ttlMs })) === "OK";
    },
  };
}

export async function kvFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<KV> {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return redisKV(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
  }
  return new FileKV();
}

/** Large document text is stored gzipped and base64-encoded under its content hash. */
export async function putText(kv: KV, text: string): Promise<string> {
  const hash = sha256(text);
  if (!(await kv.get(`text:${hash}`))) await kv.set(`text:${hash}`, gzipSync(text).toString("base64"));
  return hash;
}

export async function getText(kv: KV, hash: string): Promise<string | null> {
  const b64 = await kv.get<string>(`text:${hash}`);
  return b64 ? gunzipSync(Buffer.from(b64, "base64")).toString("utf8") : null;
}

/** Returns the cached value for `key`, or computes, stores and returns it. */
export async function cached<T>(kv: KV, key: string, compute: () => Promise<T>, ttlSec?: number): Promise<T> {
  const hit = await kv.get<T>(key);
  if (hit !== null) return hit;
  const value = await compute();
  await kv.set(key, value, ttlSec);
  return value;
}

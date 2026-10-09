// Copies the local cache (.cache/kv, FileKV) to Upstash Redis so the deployed app serves the demo
// briefings, documents, triage and explanations already paid for. Locks and expired entries are
// skipped; remaining TTLs are kept.
// Run: vercel env pull .env.production.local --environment production, then
// node --env-file=.env.local --env-file=.env.production.local node_modules/tsx/dist/cli.mjs scripts/push-cache.ts [--dry]
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Redis } from "@upstash/redis";
import { redisCredentials } from "../src/lib/store";

const dry = process.argv.includes("--dry");
const creds = redisCredentials();
const url = creds?.url;
const token = creds?.token;
if (!dry && (!url || !token)) {
  console.error("Upstash credentials missing (UPSTASH_REDIS_REST_* or KV_REST_API_*)");
  process.exit(1);
}
const redis = dry ? null : new Redis({ url: url!, token: token! });

// Older FileKV files do not store their key: ":" and "/" were both written as "_". Our keys only
// contain "/" inside model ids ("nvidia/..."), so the key can be rebuilt exactly. Newer files carry it.
function keyFromFile(name: string, stored?: string): string {
  return stored ?? name.replace(/\.json$/, "").replace(/_/g, ":").replace(/nvidia:/g, "nvidia/");
}

const dir = join(process.cwd(), ".cache", "kv");
let copied = 0;
let skipped = 0;
const now = Date.now();
for (const name of readdirSync(dir)) {
  const entry = JSON.parse(readFileSync(join(dir, name), "utf8")) as { k?: string; v: unknown; exp: number | null };
  const key = keyFromFile(name, entry.k);
  // Runtime state and superseded cache versions stay local.
  if (/^(lock|visitor|global|salt|running|job|analysis|verify2|verify3):/.test(key)) {
    skipped++;
    continue;
  }
  if (entry.exp !== null && entry.exp < now) {
    skipped++;
    continue;
  }
  const ttl = entry.exp ? Math.ceil((entry.exp - now) / 1000) : undefined;
  if (!dry) await (ttl ? redis!.set(key, entry.v, { ex: ttl }) : redis!.set(key, entry.v));
  copied++;
}
console.log(`${dry ? "Would copy" : "Copied"} ${copied} entries, skipped ${skipped}.`);

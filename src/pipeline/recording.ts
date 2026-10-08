// Record real external responses once (models, Tavily, downloads), then replay them in tests so
// the full pipeline runs offline on real data (constitution IX and X) without spending credits.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { sha256 } from "@/lib/store";
import type { Completion, CompletionRequest, Transport } from "@/lib/models";
import type { Fetcher } from "./context";

type Post = (path: string, body: Record<string, unknown>) => Promise<Record<string, unknown>>;

export interface Tape {
  models: Record<string, Completion>;
  tavily: Record<string, Record<string, unknown>>;
  fetch: Record<string, { status: number; contentType: string; b64: string }>;
  now?: string;
}

const modelKey = (r: CompletionRequest) => sha256(JSON.stringify({ model: r.model, messages: r.messages }));
const tavilyKey = (path: string, body: Record<string, unknown>) => sha256(JSON.stringify({ path, body }));

export class Recorder {
  tape: Tape = { models: {}, tavily: {}, fetch: {} };
  constructor(private readonly file: string) {
    if (existsSync(file)) this.tape = JSON.parse(readFileSync(file, "utf8"));
  }
  transport(inner: Transport): Transport {
    return async (req, timeout) => {
      const res = await inner(req, timeout);
      this.tape.models[modelKey(req)] = res;
      return res;
    };
  }
  post(inner: Post): Post {
    return async (path, body) => {
      const res = await inner(path, body);
      this.tape.tavily[tavilyKey(path, body)] = res;
      return res;
    };
  }
  fetcher(inner: Fetcher): Fetcher {
    return async (url) => {
      const res = await inner(url);
      this.tape.fetch[url] = { status: res.status, contentType: res.contentType, b64: Buffer.from(res.bytes).toString("base64") };
      return res;
    };
  }
  save() {
    writeFileSync(this.file, JSON.stringify(this.tape));
  }
}

export function replay(tape: Tape): { transport: Transport; post: Post; fetcher: Fetcher } {
  return {
    transport: async (req) => {
      const hit = tape.models[modelKey(req)];
      if (!hit) throw new Error(`No recorded model reply for ${req.model}`);
      return hit;
    },
    post: async (path, body) => {
      const hit = tape.tavily[tavilyKey(path, body)];
      if (!hit) throw new Error(`No recorded Tavily reply for ${path}`);
      return hit;
    },
    fetcher: async (url) => {
      const hit = tape.fetch[url];
      if (!hit) throw new Error(`No recorded download for ${url}`);
      return { status: hit.status, contentType: hit.contentType, bytes: new Uint8Array(Buffer.from(hit.b64, "base64")) };
    },
  };
}

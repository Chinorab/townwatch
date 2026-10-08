// Everything a stage touches from the outside world, injected so stages stay testable.
import { kvFromEnv, MemoryKV, type KV } from "@/lib/store";
import { Models, tokenFactoryTransport, type Transport, modelConfigFromEnv } from "@/lib/models";
import { Tavily, tavilyPost, type TavilyApi } from "@/lib/tavily";
import type { Recorder } from "./recording";

export interface FetchResult {
  status: number;
  contentType: string;
  bytes: Uint8Array;
}
export type Fetcher = (url: string) => Promise<FetchResult>;

export interface Ctx {
  kv: KV;
  models: Models;
  tavily: TavilyApi;
  fetcher: Fetcher;
  now: Date;
  log: (msg: string) => void;
}

const UA = "Mozilla/5.0 (compatible; Townwatch/0.1; +https://github.com/Chinorab/townwatch)";

export const httpFetcher: Fetcher = async (url) => {
  const r = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(45_000) });
  return {
    status: r.status,
    contentType: r.headers.get("content-type") ?? "",
    bytes: new Uint8Array(await r.arrayBuffer()),
  };
};

export async function createContext(opts: { transport?: Transport; log?: (m: string) => void; recorder?: Recorder; kv?: KV } = {}): Promise<Ctx> {
  const r = opts.recorder;
  const transport = opts.transport ?? tokenFactoryTransport();
  return {
    kv: opts.kv ?? (await kvFromEnv()),
    models: new Models(r ? r.transport(transport) : transport, modelConfigFromEnv()),
    tavily: new Tavily(r ? r.post(tavilyPost()) : tavilyPost()),
    fetcher: r ? r.fetcher(httpFetcher) : httpFetcher,
    now: new Date(),
    log: opts.log ?? ((m) => console.log(m)),
  };
}

/** Test context: memory store, no network unless the test injects fakes. */
export function testContext(over: Partial<Ctx> & { transport?: Transport } = {}): Ctx {
  const blocked = () => {
    throw new Error("Not available in this test");
  };
  return {
    kv: new MemoryKV(),
    models: new Models(over.transport ?? (blocked as never), {
      fast: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
      explain: "nvidia/Nemotron-3-Ultra-550b-a55b",
      fallback: "nvidia/nemotron-3-super-120b-a12b",
      timeoutMs: {},
    }),
    tavily: {
      credits: 0,
      search: blocked as never,
      extract: blocked as never,
      map: blocked as never,
    },
    fetcher: blocked as never,
    now: new Date("2026-10-08T12:00:00Z"),
    log: () => {},
    ...over,
  };
}

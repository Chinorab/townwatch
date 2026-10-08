// JSON from public platform APIs through the injected fetcher, cached for six hours: a portal is
// never asked twice for the same list in one session of analyses.
import { cached, sha256 } from "@/lib/store";
import type { Ctx } from "../context";

export async function getJson<T>(ctx: Ctx, url: string): Promise<T> {
  return cached(
    ctx.kv,
    `api:${sha256(url)}`,
    async () => {
      const r = await ctx.fetcher(url);
      if (r.status !== 200) throw new Error(`${url} answered ${r.status}`);
      return JSON.parse(new TextDecoder().decode(r.bytes)) as T;
    },
    6 * 3_600,
  );
}

/** The window is extended back so the latest past meeting is available as a fallback. */
export function lookbackFrom(from: string, days = 60): string {
  return new Date(new Date(`${from}T00:00:00Z`).getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

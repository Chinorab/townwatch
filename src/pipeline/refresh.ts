// Nightly refresh of followed places (US6, FR-026). A place is followed once a briefing has been
// published for it. Refreshing re-runs the same job steps as the web app: every stage is cached
// by content, so an unchanged agenda costs no model call, and only the items of a new agenda are
// sorted and explained. Listings are cached per day, so each night sees newly published agendas.
import { lookupPlace } from "@/lib/place-index";
import { placeFromId } from "@/lib/places";
import { BUDGET_STOP_USD } from "@/lib/limits";
import type { KV } from "@/lib/store";
import type { Briefing, Place } from "@/lib/schemas";
import type { Ctx } from "./context";
import { analysePlace } from "./jobs";
import { followedPlaces } from "./followed";

export interface RefreshResult {
  placeId: string;
  status: "unchanged" | "updated" | "skipped" | "failed";
  newItems: number;
  modelCalls: number;
  costUsd: number;
  tavilyCredits: number;
  detail?: string;
}

const itemHashes = (b: Briefing | null) =>
  new Set(b ? [...b.headlineItems.map((h) => h.item.itemHash), ...b.alsoOnAgenda.map((a) => a.itemHash).filter(Boolean)] : []);

/** The place as it was analysed (towns keep their county), falling back to the place index. */
async function placeOf(kv: KV, placeId: string): Promise<Place> {
  const stored = await kv.get<Place>(`place:${placeId}`);
  return placeFromId(placeId, stored?.countyName ?? undefined, lookupPlace(placeId));
}

export async function refreshPlace(ctx: Ctx, placeId: string): Promise<RefreshResult> {
  const base = { placeId, newItems: 0, modelCalls: 0, costUsd: 0, tavilyCredits: 0 };
  if (await ctx.kv.get(`running:${placeId}`)) return { ...base, status: "skipped", detail: "an analysis is already running" };
  const before = itemHashes(await ctx.kv.get<Briefing>(`briefing:${placeId}`));
  try {
    const r = await analysePlace(ctx, await placeOf(ctx.kv, placeId));
    const newItems = [...itemHashes(r.briefing)].filter((h) => !before.has(h)).length;
    return {
      placeId,
      status: newItems > 0 ? "updated" : "unchanged",
      newItems,
      modelCalls: r.newCalls.length,
      costUsd: r.newCalls.reduce((s, c) => s + c.costUsd, 0),
      tavilyCredits: r.newTavilyCredits,
    };
  } catch (err) {
    return { ...base, status: "failed", detail: String(err instanceof Error ? err.message : err).slice(0, 200) };
  }
}

/** Refreshes every followed place in turn, stopping at the project's spend limit. */
export async function refreshAll(ctx: Ctx, placeIds?: string[], onResult: (r: RefreshResult) => void = () => {}): Promise<RefreshResult[]> {
  const ids = placeIds?.length ? placeIds : await followedPlaces(ctx.kv);
  const out: RefreshResult[] = [];
  for (const id of ids) {
    if (((await ctx.kv.get<number>("ledger:total")) ?? 0) >= BUDGET_STOP_USD) {
      const r: RefreshResult = { placeId: id, status: "skipped", newItems: 0, modelCalls: 0, costUsd: 0, tavilyCredits: 0, detail: "spend limit reached" };
      out.push(r);
      onResult(r);
      continue;
    }
    const r = await refreshPlace(ctx, id);
    out.push(r);
    onResult(r);
  }
  return out;
}

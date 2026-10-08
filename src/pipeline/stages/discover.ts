// Finds candidate agenda sources for one governing body from the place name alone (FR-004),
// with two basic Tavily searches. Obvious non-official hosts are dropped here; deciding what is
// official, right place and right body is the verify stage's job.
import { cached, sha256 } from "@/lib/store";
import { placeLabel } from "@/lib/places";
import type { BodyRole, Candidate, Place } from "@/lib/schemas";
import type { Ctx } from "../context";

const NOT_OFFICIAL_HOST =
  /(^|\.)(facebook|fb|twitter|x|instagram|linkedin|youtube|tiktok|reddit|wikipedia|ballotpedia|patch|yelp|nextdoor|mapquest|indeed|glassdoor|zillow|countyoffice|govserv|opengovus|citydata|city-data)\.|news|times|herald|gazette|journal|tribune|courier|observer|post\b|press|daily|weekly|radio|tv\b/i;

export function isExcludedHost(url: string): boolean {
  try {
    return NOT_OFFICIAL_HOST.test(new URL(url).hostname);
  } catch {
    return true;
  }
}

export function queriesFor(place: Place, phrase: string, role: BodyRole): string[] {
  const where = role === "county_executive" && place.kind === "town" && place.countyName ? `${place.countyName}, ${place.stateName}` : placeLabel(place);
  return [`${where} ${phrase} meeting agenda`, `${where.replace(`, ${place.stateName}`, ` ${place.state}`)} ${phrase} agendas minutes`];
}

export async function discover(ctx: Ctx, place: Place, body: { role: BodyRole; phrase: string }): Promise<Candidate[]> {
  return cached(
    ctx.kv,
    `discover:${place.placeId}:${body.role}:${sha256(body.phrase).slice(0, 8)}`,
    async () => {
      const seen = new Map<string, Candidate>();
      for (const q of queriesFor(place, body.phrase, body.role)) {
        for (const r of await ctx.tavily.search(q, { maxResults: 10 })) {
          if (isExcludedHost(r.url) || seen.has(r.url)) continue;
          seen.set(r.url, { role: body.role, url: r.url, title: r.title ?? "", snippet: (r.content ?? "").slice(0, 300), score: r.score ?? 0 });
        }
      }
      return [...seen.values()].sort((a, b) => b.score - a.score).slice(0, 8);
    },
    30 * 86_400,
  );
}

/** Second pass on the place's own official site: when the main body's agenda page was not among
 *  the general results (Sussex County, VA keeps it on sussexcountyva.gov under yearly pages). */
export async function discoverOnSite(ctx: Ctx, place: Place, body: { role: BodyRole; phrase: string }, host: string): Promise<Candidate[]> {
  return cached(
    ctx.kv,
    `discoversite:${place.placeId}:${body.role}:${host}:${sha256(body.phrase).slice(0, 8)}`,
    async () =>
      (await ctx.tavily.search(`${body.phrase} meeting agendas minutes ${ctx.now.getUTCFullYear()}`, { maxResults: 8, includeDomains: [host] }))
        .filter((r) => !isExcludedHost(r.url))
        .map((r) => ({ role: body.role, url: r.url, title: r.title ?? "", snippet: (r.content ?? "").slice(0, 300), score: r.score ?? 0 })),
    30 * 86_400,
  );
}

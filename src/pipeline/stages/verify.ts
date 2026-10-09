// Source verification (FR-005, constitution IV): the fast Nemotron model judges each candidate
// on three separate questions. Step 1 showed why a domain rule is not enough: official sites on
// .com, and same-named places in other states on .gov.
import { z } from "zod";
import { cached } from "@/lib/store";
import { countyBodyPhrase, placeLabel, STATE_NAMES } from "@/lib/places";
import { Verification, type BodyRole, type Candidate, type Place, type Source } from "@/lib/schemas";
import { sha256 } from "@/lib/store";
import type { Ctx } from "../context";
import { detectPlatform } from "../readers/index";

const ROLE_TEXT: Record<BodyRole, string> = {
  executive: "the town or city council (main elected governing body of the town)",
  county_executive: "the county board of commissioners or county council (main elected governing body of the county)",
  school_board: "the board of education or school board of the public school district serving this place",
  planning: "the planning board, planning commission or zoning board",
};

const SYSTEM = `You check whether web pages are official sources of meeting agendas for one US local government body.
Answer with a JSON array only, one object per candidate, in the same order:
[{"url": string, "official": boolean, "rightPlace": boolean, "rightBody": boolean, "confidence": number between 0 and 1, "reason": string under 20 words, "bodyName": string or null}]
Definitions:
- official: the page is published by the government itself, its public school district, or an agenda platform the body uses (legistar.com, civicclerk.com, boarddocs.com, granicus.com, municode meetings, CivicPlus AgendaCenter, simbli). News sites, social media, directories, wikis and aggregators are NOT official. A .com or .org domain can be official if it is clearly the government's own site.
- rightPlace: the page belongs to exactly the place named, in the state named. A place with the same name in another state, or a neighbouring county or town, is NOT the right place.
- rightBody: the page lists or links to meeting agendas or minutes of the body described (a page listing agendas of several bodies including it counts).
- bodyName: the official name of that body as written on the page, or null.`;

export interface VerifyResult {
  /** Accepted sources, best first. */
  accepted: Source[];
  rejected: { url: string; reason: string }[];
  /** Hosts the model judged official and in the right place, whatever the body: the place's own sites. */
  ownHosts?: string[];
}

function describePlace(place: Place, role: BodyRole): string {
  if (role === "county_executive" && place.kind === "town") {
    return place.countyName ? `${place.countyName}, ${place.stateName} (the county containing ${place.name})` : `the county containing ${placeLabel(place)}`;
  }
  return `${placeLabel(place)} (${place.kind})`;
}

/** States whose county body has its own official name get it in the prompt (Quorum Court,
 *  Police Jury...); others keep the default wording. */
function bodyText(place: Place, role: BodyRole): string {
  if (role !== "county_executive" || place.kind !== "county") return ROLE_TEXT[role];
  const phrase = countyBodyPhrase(place);
  return phrase === "board of commissioners county council" ? ROLE_TEXT[role] : `the ${phrase} (main elected governing body of the ${/parish$/i.test(place.name) ? "parish" : "county"})`;
}

const AGENDA_PAGE = /agenda|minutes/i;
const ROLE_URL: Record<BodyRole, RegExp> = {
  executive: /council|aldermen|selectmen/i,
  county_executive: /commissioners|supervisors|county-council|fiscal-court|commissioners-court/i,
  school_board: /board-of-education|school-board|boe|board/i,
  planning: /planning|zoning/i,
};
const BODY_PAGE = /meeting|board|council|commission/i;

/** A domain that names another state ("cumberlandcountync.gov" for Cumberland County, Virginia;
 *  "co.lincoln.nc.us" for Lincoln County, Colorado) cannot be the right place. Deterministic,
 *  because the model accepted both on 2026-10-08. */
export function otherStateHost(url: string, state: string, nameToken?: string): string | null {
  const host = new URL(url).hostname.toLowerCase();
  const squashed = host.replace(/[^a-z]/g, "");
  const own = STATE_NAMES[state]?.toLowerCase().replace(/[^a-z]/g, "");
  for (const [code, name] of Object.entries(STATE_NAMES)) {
    if (code === state) continue;
    const s = code.toLowerCase();
    // "franklincotn.us" is Tennessee, "franklincoks.org" Kansas, "cumberlandcountync.gov" North Carolina
    if (new RegExp(`(county|co|\\.)${s}\\.(gov|us|org|com|net)$`).test(host)) return code;
    // The place name glued to another state code: "townofporterny.gov" is Porter, New York.
    if (nameToken && nameToken.length >= 4 && new RegExp(`${nameToken}${s}\\.(gov|us|org|com|net)$`).test(host)) return code;
    // Full state names too ("mcohio.org" is Montgomery County, Ohio), unless the host carries the
    // place's own state name (a "kansas" inside "arkansas" is not Kansas).
    const full = name.toLowerCase().replace(/[^a-z]/g, "");
    if (full.length >= 4 && squashed.includes(full) && !(own && squashed.includes(own) && own.includes(full))) return code;
  }
  return null;
}

/** A domain built on another county's name ("salinecounty.org" for Franklin County, Arkansas;
 *  "rockinghamcountync.gov" for Edgecombe County) belongs to that county. */
export function otherCountyHost(url: string, nameToken: string): string | null {
  if (nameToken.length < 4) return null;
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  if (host.replace(/[^a-z]/g, "").includes(nameToken)) return null;
  const m = host.match(/^([a-z]{4,})(?:county|parish)/) ?? host.match(/^co\.([a-z]{4,})\./);
  return m ? m[1] : null;
}

function placeToken(place: Place, role: BodyRole): string {
  return (role === "county_executive" && place.kind === "town" ? (place.countyName ?? "") : place.name)
    .toLowerCase()
    .replace(/ (county|parish|borough)$/, "")
    .replace(/[^a-z]/g, "");
}

export async function verify(ctx: Ctx, place: Place, role: BodyRole, all: Candidate[]): Promise<VerifyResult> {
  const token = placeToken(place, role);
  const foreign = all.filter((c) => otherStateHost(c.url, place.state, token));
  const candidates = all.filter((c) => !foreign.includes(c));
  const result = await verifyCandidates(ctx, place, role, candidates);
  // Applied after the model so its prompt (and the cache) is unchanged: the model may accept a
  // neighbouring county's site, the domain rule overrides it.
  const otherCounty = result.accepted.filter((s) => otherCountyHost(s.url, token));
  return {
    ownHosts: (result.ownHosts ?? []).filter((h) => !otherCountyHost(`https://${h}/`, token) && !otherStateHost(`https://${h}/`, place.state, token)),
    accepted: result.accepted.filter((s) => !otherCounty.includes(s)),
    rejected: [
      ...foreign.map((c) => ({ url: c.url, reason: `domain of another state (${otherStateHost(c.url, place.state, token)})` })),
      ...otherCounty.map((s) => ({ url: s.url, reason: `domain of another county (${otherCountyHost(s.url, token)})` })),
      ...result.rejected,
    ],
  };
}

async function verifyCandidates(ctx: Ctx, place: Place, role: BodyRole, candidates: Candidate[]): Promise<VerifyResult> {
  if (candidates.length === 0) return { accepted: [], rejected: [], ownHosts: [] };
  const top = candidates.slice(0, 6);
  return cached(ctx.kv, `verify4:${ctx.models.config.fast}:${sha256(place.placeId + role + top.map((c) => c.url).join("|"))}`, async () => {
    const user =
      `Place: ${describePlace(place, role)}\nBody: ${bodyText(place, role)}\nCandidates:\n` +
      top.map((c, i) => `${i + 1}. url: ${c.url}\n   title: ${c.title}\n   snippet: ${c.snippet.replace(/\s+/g, " ")}`).join("\n");
    let verdicts: Verification[] = [];
    try {
      verdicts = await ctx.models.chatJson({ stage: "verify", tier: "fast", system: SYSTEM, user, schema: z.array(Verification), maxTokens: 900, ref: `${place.placeId}:${role}` });
    } catch (err) {
      ctx.log(`verify failed for ${role}: ${String(err).slice(0, 160)}`);
    }
    const byUrl = new Map(verdicts.map((v) => [v.url, v]));
    const rejected: { url: string; reason: string }[] = [];
    const accepted: { c: Candidate; v: Verification }[] = [];
    top.forEach((c, i) => {
      const v = byUrl.get(c.url) ?? verdicts[i];
      if (!v) return rejected.push({ url: c.url, reason: "not judged" });
      if (v.official && v.rightPlace && v.rightBody && v.confidence >= 0.6) accepted.push({ c, v: { ...v, url: c.url } });
      else rejected.push({ url: c.url, reason: v.reason || [!v.official && "not official", !v.rightPlace && "wrong place", !v.rightBody && "wrong body"].filter(Boolean).join(", ") });
    });

    // A site whose domain carries the place's name is the place's own (wascocountyor.gov), not a
    // neighbouring city's (thedalles.gov was accepted for Wasco County on 2026-10-08).
    const nameToken = (role === "county_executive" && place.kind === "town" ? place.countyName ?? "" : place.name)
      .toLowerCase()
      .replace(/ (county|parish|borough)$/, "")
      .replace(/[^a-z]/g, "");
    const rank = ({ c, v }: { c: Candidate; v: Verification }) => {
      const p = detectPlatform(c.url).platform;
      const own = nameToken.length >= 4 && new URL(c.url).hostname.replace(/[^a-z]/g, "").includes(nameToken) ? 2 : 0;
      // A page named after the body ("AgendaCenter/Board-of-Supervisors-2") beats a portal root
      // that lists every board, whose newest agenda may belong to another body.
      const named = ROLE_URL[role].test(decodeURIComponent(new URL(c.url).pathname)) ? 1.5 : 0;
      return (p === "legistar" || p === "civicclerk" ? 4 : 0) + own + named + (AGENDA_PAGE.test(c.url + " " + c.title) ? 3 : BODY_PAGE.test(c.url + " " + c.title) ? 1 : 0) + v.confidence + c.score / 10;
    };
    const ranked = accepted.sort((a, b) => rank(b) - rank(a)).map(({ c, v }): Source => {
      const { platform, key } = detectPlatform(c.url);
      return { sourceId: sha256(c.url), role, url: c.url, host: new URL(c.url).host, platform, platformKey: key, verification: v, accepted: true, checkedAt: ctx.now.toISOString() };
    });
    const ownHosts = [...new Set(top.filter((c, i) => { const v = byUrl.get(c.url) ?? verdicts[i]; return v?.official && v.rightPlace; }).map((c) => new URL(c.url).host))];
    return { accepted: ranked, rejected, ownHosts };
  }, 30 * 86_400);
}

// Source finding and reading stages shared by analysis jobs (jobs.ts) and the CLI, plus the
// spend recorder that charges every model call and Tavily credit to its place.
import { sha256 } from "@/lib/store";
import { bodiesFor } from "@/lib/places";
import type { AgendaItem, BodyRef, Meeting, ModelCall, Place, Source } from "@/lib/schemas";
import type { Ctx } from "./context";
import { discover } from "./stages/discover";
import { verify } from "./stages/verify";
import { readerFor } from "./readers/index";
import { windowFor, type ListedMeeting } from "./readers/types";
import { pdfText, readDocument } from "./stages/read";
import { splitAgenda } from "./stages/split";

export type Progress = (stage: string, detail: string) => void;

/**
 * Runs `fn` and charges every model call and Tavily credit it caused to the place
 * (`calls:{placeId}`, `tavily:{placeId}`) and to the global ledger. Each stage is wrapped, so
 * spend is recorded whether a stage runs alone from the CLI or inside a full analysis.
 */
export async function withSpend<T>(ctx: Ctx, placeId: string, fn: () => Promise<T>): Promise<T> {
  const c0 = ctx.models.calls.length;
  const t0 = ctx.tavily.credits;
  try {
    return await fn();
  } finally {
    const calls = ctx.models.calls.slice(c0);
    const credits = ctx.tavily.credits - t0;
    if (calls.length) await ctx.kv.set(`calls:${placeId}`, [...((await ctx.kv.get<ModelCall[]>(`calls:${placeId}`)) ?? []), ...calls]);
    if (credits) await ctx.kv.set(`tavily:${placeId}`, ((await ctx.kv.get<number>(`tavily:${placeId}`)) ?? 0) + credits);
    const cost = calls.reduce((s, c) => s + c.costUsd, 0);
    if (cost > 0) await ctx.kv.incrByFloat("ledger:total", cost);
  }
}

export interface SourcesResult {
  bodies: BodyRef[];
  sources: Source[];
  rejected: { url: string; reason: string }[];
  /** Other accepted, readable candidates per body, tried in order when the first yields no agenda. */
  alternates?: Record<string, Source[]>;
}

export function findSources(ctx: Ctx, place: Place, progress: Progress = () => {}): Promise<SourcesResult> {
  return withSpend(ctx, place.placeId, () => findSourcesInner(ctx, place, progress));
}

async function findSourcesInner(ctx: Ctx, place: Place, progress: Progress): Promise<SourcesResult> {
  const bodies: BodyRef[] = [];
  const sources: Source[] = [];
  const rejected: { url: string; reason: string }[] = [];
  const used = new Set<string>();
  const alternates: Record<string, Source[]> = {};
  for (const body of bodiesFor(place)) {
    const candidates = await discover(ctx, place, body);
    const v = await verify(ctx, place, body.role, candidates);
    // One page serves one body: the model sometimes accepts the commission's agenda page for
    // the planning board too, which would list the same meetings twice.
    const source = v.accepted.find((s) => !used.has(s.url)) ?? null;
    rejected.push(...v.rejected);
    alternates[body.role] = v.accepted.filter((s) => s !== source && readerFor(s.platform) !== null).slice(0, 2);
    if (!source) {
      bodies.push({ role: body.role, name: body.role, sourceId: null, coverage: "not_found", portalUrl: null });
      progress("discover", `${body.role}: no official source found`);
      continue;
    }
    used.add(source.url);
    const readable = readerFor(source.platform) !== null;
    bodies.push({
      role: body.role,
      name: source.verification.bodyName ?? body.role,
      sourceId: source.sourceId,
      coverage: readable ? "covered" : "unreadable",
      portalUrl: source.url,
    });
    if (readable) sources.push(source);
    progress("discover", `${body.role}: ${source.url} (${source.platform})`);
  }
  return { bodies, sources, rejected, alternates };
}

export interface ReadResult {
  meetings: Meeting[];
  items: AgendaItem[];
  headers: Map<string, string>; // meetingId → record header used for grounding
  meetingsBySource: Map<string, number>;
  /** The source finally read for each body (an alternate when the first one yielded nothing). */
  sourcesUsed: Source[];
}

/** A verified page that yields no dated agenda is not a usable source (the model accepted a
 *  planning board bylaws PDF on 2026-10-08): its body becomes "not found", with the reason shown. */
export function settleCoverage(found: SourcesResult, read: ReadResult): SourcesResult {
  const usedByRole = new Map(read.sourcesUsed.map((src) => [src.role, src]));
  const bodies: BodyRef[] = [];
  const sources: Source[] = [];
  const rejected = [...found.rejected];
  for (const b of found.bodies) {
    const src = usedByRole.get(b.role);
    if (!src) {
      bodies.push(b);
      continue;
    }
    if (!read.meetingsBySource.get(src.sourceId)) {
      bodies.push({ ...b, coverage: "not_found", sourceId: null });
      rejected.push({ url: src.url, reason: "no dated agendas found on this page" });
      continue;
    }
    bodies.push({ ...b, name: src.verification.bodyName ?? b.name, sourceId: src.sourceId, portalUrl: src.url, coverage: "covered" });
    sources.push(src);
  }
  for (const list of Object.values(found.alternates ?? {}))
    for (const alt of list) if (!sources.some((x) => x.url === alt.url) && !rejected.some((r) => r.url === alt.url)) rejected.push({ url: alt.url, reason: "accepted, a better candidate was kept" });
  return { bodies, sources, rejected };
}

/** Text of each page of a platform's agenda PDF, by direct download only (free; no Tavily
 *  fallback here because the items themselves already came from the API). */
async function agendaPages(ctx: Ctx, url: string): Promise<string[] | null> {
  const key = `pdfpages:${sha256(url)}`;
  const hit = await ctx.kv.get<string[] | false>(key);
  if (hit !== null) return hit || null;
  let pages: string[] | false = false;
  try {
    const r = await ctx.fetcher(url);
    if (r.status === 200 && /pdf/i.test(r.contentType + String.fromCharCode(...r.bytes.slice(0, 4)))) {
      const { text, pages: spans } = await pdfText(r.bytes);
      pages = spans.map((p) => text.slice(p.start, p.end));
    }
  } catch {
    // leave pages unknown
  }
  await ctx.kv.set(key, pages, pages ? undefined : 3_600);
  return pages || null;
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** First page whose text contains the start of the item title. */
function pageOf(pages: string[] | null, title: string): number | null {
  if (!pages) return null;
  const probe = squash(title).slice(0, 40);
  if (probe.length < 12) return null;
  const i = pages.findIndex((p) => squash(p).includes(probe));
  return i >= 0 ? i + 1 : null;
}

function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function readSources(ctx: Ctx, placeId: string, sources: Source[], progress: Progress = () => {}, alternates: Record<string, Source[]> = {}): Promise<ReadResult> {
  return withSpend(ctx, placeId, () => readSourcesInner(ctx, sources, progress, alternates));
}

async function readSourcesInner(ctx: Ctx, sources: Source[], progress: Progress, alternates: Record<string, Source[]>): Promise<ReadResult> {
  const window = windowFor(ctx.now);
  const meetings: Meeting[] = [];
  const items: AgendaItem[] = [];
  const headers = new Map<string, string>();
  const meetingsBySource = new Map<string, number>();
  const sourcesUsed: Source[] = [];
  const taken = new Set(sources.map((s) => s.url));
  const seenAgendas = new Set<string>();

  for (const first of sources) {
    // Second chance: when the chosen page yields no agenda, try the other accepted candidates
    // (Wasco County, OR: a city page outranked the county's agendas page on 2026-10-08).
    // A source that fails to read (site down, unexpected format) leaves its body uncovered; it
    // never stops the analysis of the other bodies.
    const safeList = async (s: Source): Promise<ListedMeeting[]> => {
      try {
        return await readerFor(s.platform)!.list(ctx, s, window);
      } catch (err) {
        ctx.log(`could not read ${s.url}: ${String(err).slice(0, 160)}`);
        return [];
      }
    };
    let source = first;
    let listed: ListedMeeting[] = await safeList(source);
    for (const alt of alternates[first.role] ?? []) {
      if (listed.length > 0) break;
      if (taken.has(alt.url)) continue;
      const altListed = await safeList(alt);
      if (altListed.length > 0) {
        progress("read", `${first.role}: ${first.url} had no agenda, using ${alt.url}`);
        source = alt;
        listed = altListed;
        taken.add(alt.url);
      }
    }
    sourcesUsed.push(source);
    meetingsBySource.set(source.sourceId, listed.length);
    progress("read", `${source.role}: ${listed.length} meetings in window`);
    for (const lm of listed) {
      // A portal root can list another body's agenda (Caroline County, VA: the supervisors' page
      // and the planning page both led to one planning agenda): an agenda is read for one body only.
      if (seenAgendas.has(lm.agendaUrl)) continue;
      seenAgendas.add(lm.agendaUrl);
      const meetingId = sha256(`${source.sourceId}|${lm.date}|${lm.bodyName}`);
      const meeting: Meeting = { meetingId, sourceId: source.sourceId, body: lm.bodyName, role: source.role, date: lm.date, time: lm.time, location: lm.location, agendaUrl: lm.agendaUrl, documentHashes: [] };

      if (lm.items) {
        // Platform API already gives numbered items; the agenda file is the citation target.
        const docHash = sha256(lm.agendaUrl);
        headers.set(meetingId, [lm.bodyName, longDate(lm.date), lm.time, lm.location, lm.note].filter(Boolean).join(" "));
        const pages = await agendaPages(ctx, lm.agendaUrl);
        for (const pi of lm.items) {
          items.push({ itemHash: sha256(`${docHash}|${pi.number}|${pi.text}`), number: pi.number, title: pi.title, text: pi.text, meetingId, docHash, docUrl: lm.agendaUrl, page: pageOf(pages, pi.title) });
        }
      } else {
        // Agenda first; minutes only when there is no agenda for that meeting. Packets are not read in v1.
        const agenda = lm.docs.find((d) => d.kind === "agenda") ?? lm.docs.find((d) => d.kind === "minutes");
        if (!agenda) continue;
        const { doc, text } = await readDocument(ctx, { ...agenda, meetingId });
        if (!doc.readable) continue;
        meeting.documentHashes.push(doc.docHash);
        meeting.agendaUrl = doc.url;
        headers.set(meetingId, text.slice(0, 600));
        items.push(...splitAgenda(text, { meetingId, docHash: doc.docHash, docUrl: doc.url }, doc.pages));
      }
      meetings.push(meeting);
    }
  }
  return { meetings, items, headers, meetingsBySource, sourcesUsed };
}

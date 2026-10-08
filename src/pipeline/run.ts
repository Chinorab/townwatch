// Full analysis of one place: discover → verify → list → read → split → triage → route →
// explain → ground → assemble. Every stage is cached, so a second run costs nothing.
// Costs are recorded per place (`calls:{placeId}`) and in the global ledger.
import { sha256 } from "@/lib/store";
import { bodiesFor, placeLabel } from "@/lib/places";
import type { AgendaItem, BodyRef, Briefing, Explanation, Meeting, ModelCall, Place, Source } from "@/lib/schemas";
import type { Ctx } from "./context";
import { discover } from "./stages/discover";
import { verify } from "./stages/verify";
import { readerFor } from "./readers/index";
import { windowFor, type ListedMeeting } from "./readers/types";
import { readDocument } from "./stages/read";
import { splitAgenda } from "./stages/split";
import { triage } from "./stages/triage";
import { route } from "./stages/route";
import { explainAll, type ExplainInput } from "./stages/explain";
import { ground } from "./stages/ground";
import { assemble } from "./stages/assemble";

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
}

export function findSources(ctx: Ctx, place: Place, progress: Progress = () => {}): Promise<SourcesResult> {
  return withSpend(ctx, place.placeId, () => findSourcesInner(ctx, place, progress));
}

async function findSourcesInner(ctx: Ctx, place: Place, progress: Progress): Promise<SourcesResult> {
  const bodies: BodyRef[] = [];
  const sources: Source[] = [];
  const rejected: { url: string; reason: string }[] = [];
  const used = new Set<string>();
  for (const body of bodiesFor(place)) {
    const candidates = await discover(ctx, place, body);
    const v = await verify(ctx, place, body.role, candidates);
    // One page serves one body: the model sometimes accepts the commission's agenda page for
    // the planning board too, which would list the same meetings twice.
    const source = v.accepted.find((s) => !used.has(s.url)) ?? null;
    rejected.push(...v.rejected);
    for (const s of v.accepted) if (s !== source && !used.has(s.url)) rejected.push({ url: s.url, reason: "accepted, a better candidate was kept" });
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
  return { bodies, sources, rejected };
}

export interface ReadResult {
  meetings: Meeting[];
  items: AgendaItem[];
  headers: Map<string, string>; // meetingId → record header used for grounding
  meetingsBySource: Map<string, number>;
}

/** A verified page that yields no dated agenda is not a usable source (the model accepted a
 *  planning board bylaws PDF on 2026-10-08): its body becomes "not found", with the reason shown. */
export function settleCoverage(found: SourcesResult, read: ReadResult): SourcesResult {
  const empty = new Set(found.sources.filter((s) => !read.meetingsBySource.get(s.sourceId)).map((s) => s.sourceId));
  if (empty.size === 0) return found;
  return {
    bodies: found.bodies.map((b) => (b.sourceId && empty.has(b.sourceId) ? { ...b, coverage: "not_found", sourceId: null } : b)),
    sources: found.sources.filter((s) => !empty.has(s.sourceId)),
    rejected: [...found.rejected, ...found.sources.filter((s) => empty.has(s.sourceId)).map((s) => ({ url: s.url, reason: "no dated agendas found on this page" }))],
  };
}

function longDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function readSources(ctx: Ctx, placeId: string, sources: Source[], progress: Progress = () => {}): Promise<ReadResult> {
  return withSpend(ctx, placeId, () => readSourcesInner(ctx, sources, progress));
}

async function readSourcesInner(ctx: Ctx, sources: Source[], progress: Progress): Promise<ReadResult> {
  const window = windowFor(ctx.now);
  const meetings: Meeting[] = [];
  const items: AgendaItem[] = [];
  const headers = new Map<string, string>();
  const meetingsBySource = new Map<string, number>();

  for (const source of sources) {
    const listed: ListedMeeting[] = await readerFor(source.platform)!.list(ctx, source, window);
    meetingsBySource.set(source.sourceId, listed.length);
    progress("read", `${source.role}: ${listed.length} meetings in window`);
    for (const lm of listed) {
      const meetingId = sha256(`${source.sourceId}|${lm.date}|${lm.bodyName}`);
      const meeting: Meeting = { meetingId, sourceId: source.sourceId, body: lm.bodyName, role: source.role, date: lm.date, time: lm.time, location: lm.location, agendaUrl: lm.agendaUrl, documentHashes: [] };

      if (lm.items) {
        // Platform API already gives numbered items; the agenda file is the citation target.
        const docHash = sha256(lm.agendaUrl);
        headers.set(meetingId, [lm.bodyName, longDate(lm.date), lm.time, lm.location].filter(Boolean).join(" "));
        for (const pi of lm.items) {
          items.push({ itemHash: sha256(`${docHash}|${pi.number}|${pi.text}`), number: pi.number, title: pi.title, text: pi.text, meetingId, docHash, docUrl: lm.agendaUrl, page: null });
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
  return { meetings, items, headers, meetingsBySource };
}

export interface AnalyseResult {
  briefing: Briefing;
  newCalls: ModelCall[];
  newTavilyCredits: number;
}

export async function analysePlace(ctx: Ctx, place: Place, progress: Progress = () => {}): Promise<AnalyseResult> {
  const callsBefore = ctx.models.calls.length;
  const creditsBefore = ctx.tavily.credits;
  const analysisId = `${place.placeId}-${ctx.now.toISOString().slice(0, 10)}`;

  const discovered = await findSources(ctx, place, progress);
  const read = await readSources(ctx, place.placeId, discovered.sources, progress);
  const found = settleCoverage(discovered, read);

  const meetingInfo = new Map(read.meetings.map((m) => [m.meetingId, { body: m.body, date: m.date }]));
  const triaged = await withSpend(ctx, place.placeId, () => triage(ctx, read.items, meetingInfo));
  progress("triage", `${triaged.filter((i) => i.triage).length}/${triaged.length} items sorted`);
  const routed = route(triaged);
  const escalated = routed.filter((i) => i.routing?.escalate);
  progress("route", `${escalated.length} of ${routed.length} items escalated`);

  const meetingById = new Map(read.meetings.map((m) => [m.meetingId, m]));
  const inputs: ExplainInput[] = escalated.map((item) => {
    const m = meetingById.get(item.meetingId)!;
    return { item, bodyName: m.body, placeLabel: placeLabel(place), meetingDate: m.date, meetingTime: m.time, meetingLocation: m.location, header: read.headers.get(m.meetingId) ?? "" };
  });
  const drafts = await withSpend(ctx, place.placeId, () => explainAll(ctx, inputs));
  const explanations = new Map<string, Explanation>();
  for (const input of inputs) {
    const d = drafts.get(input.item.itemHash);
    if (d) explanations.set(input.item.itemHash, ground(d.draft, input.item, input.header, d.model));
  }
  progress("explain", `${explanations.size} explanations, ${[...explanations.values()].reduce((s, e) => s + e.dropped.count, 0)} statements dropped by grounding`);

  const newCalls = ctx.models.calls.slice(callsBefore);
  const newTavilyCredits = ctx.tavily.credits - creditsBefore;
  const allCalls = (await ctx.kv.get<ModelCall[]>(`calls:${place.placeId}`)) ?? [];
  const allCredits = (await ctx.kv.get<number>(`tavily:${place.placeId}`)) ?? 0;

  const briefing = assemble({
    place,
    analysisId,
    window: windowFor(ctx.now),
    bodies: found.bodies,
    sources: found.sources,
    rejected: found.rejected,
    meetings: read.meetings,
    items: routed,
    explanations,
    calls: allCalls,
    tavilyCredits: allCredits,
    now: ctx.now,
  });
  await ctx.kv.set(`briefing:${place.placeId}`, briefing);
  await ctx.kv.set(`place:${place.placeId}`, { ...place, bodies: found.bodies, lastAnalysisId: analysisId, followed: true });
  return { briefing, newCalls, newTavilyCredits };
}

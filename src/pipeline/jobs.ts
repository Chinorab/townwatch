// An analysis is a persisted job advanced in bounded steps (research R6): each call to advance()
// runs one unit of work and returns, so no HTTP request outlives the platform's time limit.
// discovering → reading → triaging → explaining (4 items per step) → assembling → done.
// Every stage is cached, so a step that is retried or resumed later repays nothing.
import { randomBytes } from "node:crypto";
import { placeLabel } from "@/lib/places";
import type { AgendaItem, Analysis, Briefing, Explanation, Meeting, ModelCall, Place, Source } from "@/lib/schemas";
import type { KV } from "@/lib/store";
import type { Ctx } from "./context";
import { findSources, readSources, settleCoverage, withSpend, type SourcesResult } from "./run";
import { triage } from "./stages/triage";
import { route } from "./stages/route";
import { draftKey, explainAll, type ExplainInput } from "./stages/explain";
import { ground } from "./stages/ground";
import { assemble, totalsOf } from "./stages/assemble";
import { windowFor } from "./readers/types";
import type { ExplanationDraft } from "@/lib/schemas";

export const EXPLAIN_PER_STEP = 4;
const LOCK_MS = 330_000;
const JOB_TTL = 7 * 86_400;

interface ReadState {
  meetings: Meeting[];
  items: AgendaItem[];
  headers: [string, string][];
}

const k = (id: string, part: string) => `job:${id}:${part}`;

export async function getAnalysis(kv: KV, id: string): Promise<Analysis | null> {
  return kv.get<Analysis>(`analysis:${id}`);
}

async function save(ctx: Ctx, a: Analysis) {
  await ctx.kv.set(`analysis:${a.analysisId}`, a, JOB_TTL);
}

export async function createAnalysis(ctx: Ctx, place: Place): Promise<Analysis> {
  const analysisId = `${place.placeId}-${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  const a: Analysis = {
    analysisId,
    placeId: place.placeId,
    status: "queued",
    progress: { sourcesFound: 0, docsRead: 0, itemsTriaged: 0, itemsEscalated: 0, itemsExplained: 0 },
    rejectedSources: [],
    startedAt: ctx.now.toISOString(),
    finishedAt: null,
    totals: { calls: 0, tokensByModel: {}, costUsd: 0, tavilyCredits: 0 },
    error: null,
  };
  await ctx.kv.set(k(analysisId, "place"), place, JOB_TTL);
  await ctx.kv.set(`running:${place.placeId}`, analysisId, 3_600);
  await save(ctx, a);
  return a;
}

/** Runs the next unit of work. Returns "locked" when another advance is already running. */
export async function advance(ctx: Ctx, id: string): Promise<Analysis | "locked"> {
  const lock = `lock:analysis:${id}`;
  if (!(await ctx.kv.setNx(lock, "1", LOCK_MS))) return "locked";
  const a = await getAnalysis(ctx.kv, id);
  try {
    if (!a) throw new Error(`Unknown analysis ${id}`);
    if (a.status === "done" || a.status === "failed") return a;
    await step(ctx, a);
    await save(ctx, a);
    return a;
  } catch (err) {
    if (!a) throw err;
    a.status = "failed";
    a.error = String(err instanceof Error ? err.message : err).slice(0, 300);
    a.finishedAt = ctx.now.toISOString();
    await save(ctx, a);
    await ctx.kv.del(`running:${a.placeId}`);
    return a;
  } finally {
    await ctx.kv.del(lock);
  }
}

async function step(ctx: Ctx, a: Analysis): Promise<void> {
  const id = a.analysisId;
  const place = (await ctx.kv.get<Place>(k(id, "place")))!;

  switch (a.status) {
    case "queued":
    case "discovering": {
      a.status = "discovering";
      const found = await findSources(ctx, place);
      await ctx.kv.set(k(id, "found"), found, JOB_TTL);
      a.progress.sourcesFound = found.sources.length;
      a.rejectedSources = found.rejected;
      a.status = "reading";
      return;
    }
    case "reading": {
      const found = (await ctx.kv.get<SourcesResult>(k(id, "found")))!;
      const read = await readSources(ctx, place.placeId, found.sources, () => {}, found.alternates);
      const settled = settleCoverage(found, read);
      await ctx.kv.set(k(id, "found"), settled, JOB_TTL);
      await ctx.kv.set(k(id, "read"), { meetings: read.meetings, items: read.items, headers: [...read.headers.entries()] } satisfies ReadState, JOB_TTL);
      a.progress.sourcesFound = settled.sources.length;
      a.rejectedSources = settled.rejected;
      a.progress.docsRead = read.meetings.length;
      a.status = "triaging";
      return;
    }
    case "triaging": {
      const read = (await ctx.kv.get<ReadState>(k(id, "read")))!;
      const meetingInfo = new Map(read.meetings.map((m) => [m.meetingId, { body: m.body, date: m.date }]));
      const routed = route(await withSpend(ctx, place.placeId, () => triage(ctx, read.items, meetingInfo)));
      await ctx.kv.set(k(id, "items"), routed, JOB_TTL);
      a.progress.itemsTriaged = routed.filter((i) => i.triage).length;
      a.progress.itemsEscalated = routed.filter((i) => i.routing?.escalate).length;
      a.status = "explaining";
      return;
    }
    case "explaining": {
      const inputs = await explainInputs(ctx, id, place);
      const failed = new Set((await ctx.kv.get<string[]>(k(id, "failed"))) ?? []);
      const pending: ExplainInput[] = [];
      for (const input of inputs) {
        if (failed.has(input.item.itemHash)) continue;
        if (!(await ctx.kv.get(draftKey(ctx, input.item.itemHash)))) pending.push(input);
      }
      const batch = pending.slice(0, EXPLAIN_PER_STEP);
      if (batch.length) {
        const results = await withSpend(ctx, place.placeId, () => explainAll(ctx, batch, EXPLAIN_PER_STEP));
        for (const input of batch) if (!results.get(input.item.itemHash)) failed.add(input.item.itemHash);
        await ctx.kv.set(k(id, "failed"), [...failed], JOB_TTL);
      }
      a.progress.itemsExplained = inputs.length - (pending.length - batch.length) - [...failed].length;
      if (pending.length <= batch.length) a.status = "assembling";
      return;
    }
    case "assembling": {
      const found = (await ctx.kv.get<SourcesResult>(k(id, "found")))!;
      const read = (await ctx.kv.get<ReadState>(k(id, "read")))!;
      const routed = (await ctx.kv.get<AgendaItem[]>(k(id, "items")))!;
      const explanations = new Map<string, Explanation>();
      for (const input of await explainInputs(ctx, id, place)) {
        const d = await ctx.kv.get<{ draft: ExplanationDraft; model: string }>(draftKey(ctx, input.item.itemHash));
        if (d) explanations.set(input.item.itemHash, ground(d.draft, input.item, input.header, d.model));
      }
      a.progress.itemsExplained = explanations.size;
      const calls = (await ctx.kv.get<ModelCall[]>(`calls:${place.placeId}`)) ?? [];
      const credits = (await ctx.kv.get<number>(`tavily:${place.placeId}`)) ?? 0;
      const briefing = assemble({
        place,
        analysisId: id,
        window: windowFor(ctx.now),
        bodies: found.bodies,
        sources: found.sources as Source[],
        rejected: found.rejected,
        meetings: read.meetings,
        items: routed,
        explanations,
        calls,
        tavilyCredits: credits,
        now: ctx.now,
      });
      await ctx.kv.set(`briefing:${place.placeId}`, briefing);
      await ctx.kv.set(`place:${place.placeId}`, { ...place, bodies: found.bodies, lastAnalysisId: id, followed: true });
      await ctx.kv.del(`running:${place.placeId}`);
      a.totals = totalsOf(calls, credits);
      a.finishedAt = ctx.now.toISOString();
      a.status = "done";
      return;
    }
  }
}

async function explainInputs(ctx: Ctx, id: string, place: Place): Promise<ExplainInput[]> {
  const read = (await ctx.kv.get<ReadState>(k(id, "read")))!;
  const routed = (await ctx.kv.get<AgendaItem[]>(k(id, "items")))!;
  const headers = new Map(read.headers);
  const byId = new Map(read.meetings.map((m) => [m.meetingId, m]));
  return routed
    .filter((i) => i.routing?.escalate)
    .map((item) => {
      const m = byId.get(item.meetingId)!;
      return { item, bodyName: m.body, placeLabel: placeLabel(place), meetingDate: m.date, meetingTime: m.time, meetingLocation: m.location, header: headers.get(m.meetingId) ?? "" };
    });
}

/** Runs an analysis to the end in-process (CLI, tests, nightly refresh). */
export async function runToEnd(ctx: Ctx, place: Place, onStep: (a: Analysis) => void = () => {}): Promise<Analysis> {
  let a = await createAnalysis(ctx, place);
  for (let i = 0; i < 200; i++) {
    const r = await advance(ctx, a.analysisId);
    if (r === "locked") throw new Error("Analysis locked by another process");
    a = r;
    onStep(a);
    if (a.status === "done" || a.status === "failed") return a;
  }
  throw new Error("Analysis did not finish in 200 steps");
}

export interface AnalyseResult {
  briefing: Briefing;
  analysis: Analysis;
  newCalls: ModelCall[];
  newTavilyCredits: number;
}

/** Full analysis of one place in-process, through the same job steps as the web app. */
export async function analysePlace(ctx: Ctx, place: Place, progress: (stage: string, detail: string) => void = () => {}): Promise<AnalyseResult> {
  const c0 = ctx.models.calls.length;
  const t0 = ctx.tavily.credits;
  const analysis = await runToEnd(ctx, place, (a) => {
    const p = a.progress;
    progress(a.status, `${p.sourcesFound} sources, ${p.docsRead} meetings, ${p.itemsTriaged} items sorted, ${p.itemsExplained}/${p.itemsEscalated} explained`);
  });
  if (analysis.status === "failed") throw new Error(`Analysis failed: ${analysis.error}`);
  const briefing = (await ctx.kv.get<Briefing>(`briefing:${place.placeId}`))!;
  return { briefing, analysis, newCalls: ctx.models.calls.slice(c0), newTavilyCredits: ctx.tavily.credits - t0 };
}

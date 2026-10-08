// Builds the briefing a resident reads (FR-015 to FR-018). Only grounded explanations become
// headline items; every other item in the window is listed verbatim under "Also on the agenda".
import type { AgendaItem, BodyRef, Briefing, Explanation, Meeting, ModelCall, PanelTotals, Place, Source } from "@/lib/schemas";
import type { Window } from "../readers/types";

const IMPACT = { low: 0, medium: 1, high: 2 } as const;

export function totalsOf(calls: ModelCall[], tavilyCredits: number): PanelTotals {
  const tokensByModel: PanelTotals["tokensByModel"] = {};
  for (const c of calls) {
    const t = (tokensByModel[c.model] ??= { input: 0, output: 0, reasoning: 0, costUsd: 0, calls: 0 });
    t.input += c.inputTokens;
    t.output += c.outputTokens;
    t.reasoning += c.reasoningTokens;
    t.costUsd += c.costUsd;
    t.calls += 1;
  }
  return { calls: calls.length, tokensByModel, costUsd: calls.reduce((s, c) => s + c.costUsd, 0), tavilyCredits };
}

function itemOrder(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
  const pb = b.split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (pa[i] === undefined) return -1;
    if (pb[i] === undefined) return 1;
    if (pa[i] !== pb[i]) return typeof pa[i] === "number" && typeof pb[i] === "number" ? (pa[i] as number) - (pb[i] as number) : String(pa[i]).localeCompare(String(pb[i]));
  }
  return 0;
}

export interface AssembleInput {
  place: Place;
  analysisId: string;
  window: Window;
  bodies: BodyRef[];
  sources: Source[];
  rejected: { url: string; reason: string }[];
  meetings: Meeting[];
  items: AgendaItem[];
  explanations: Map<string, Explanation>;
  calls: ModelCall[];
  tavilyCredits: number;
  now: Date;
}

export function assemble(x: AssembleInput): Briefing {
  const meetingById = new Map(x.meetings.map((m) => [m.meetingId, m]));
  const headlineItems: Briefing["headlineItems"] = [];
  const alsoOnAgenda: Briefing["alsoOnAgenda"] = [];

  for (const item of x.items) {
    const meeting = meetingById.get(item.meetingId);
    if (!meeting) continue;
    const e = x.explanations.get(item.itemHash);
    if (item.routing?.escalate && e && e.statements.length > 0) headlineItems.push({ item, meeting, explanation: e });
    else alsoOnAgenda.push({ number: item.number, title: item.title, docUrl: item.docUrl, page: item.page, meetingId: item.meetingId, reason: item.routing?.reason ?? "info_only", topic: item.triage?.topic, itemHash: item.itemHash });
  }

  // Editorial order: this period's meetings first (an older "latest agenda online" never leads),
  // then impact, importance, date.
  const current = (m: Meeting) => (m.date >= x.window.from ? 1 : 0);
  headlineItems.sort(
    (a, b) =>
      current(b.meeting) - current(a.meeting) ||
      IMPACT[b.item.triage!.impact] - IMPACT[a.item.triage!.impact] ||
      b.item.triage!.importance - a.item.triage!.importance ||
      a.meeting.date.localeCompare(b.meeting.date),
  );
  alsoOnAgenda.sort((a, b) => (meetingById.get(a.meetingId)!.date.localeCompare(meetingById.get(b.meetingId)!.date)) || itemOrder(a.number, b.number));

  const routingCounts: Record<string, number> = {};
  for (const it of x.items) routingCounts[it.routing?.reason ?? "untriaged"] = (routingCounts[it.routing?.reason ?? "untriaged"] ?? 0) + 1;

  return {
    placeId: x.place.placeId,
    placeName: x.place.name,
    state: x.place.state,
    analysisId: x.analysisId,
    window: x.window,
    headlineItems,
    alsoOnAgenda,
    meetings: [...x.meetings].sort((a, b) => a.date.localeCompare(b.date)),
    bodies: x.bodies,
    locatedItems: x.items.flatMap((it) => (it.locations ?? []).map((l) => ({ itemHash: it.itemHash, lat: l.lat, lon: l.lon, placeText: l.text }))),
    panel: {
      sourcesKept: x.sources.map((s) => ({ role: s.role, url: s.url, platform: s.platform })),
      sourcesRejected: x.rejected,
      itemsTotal: x.items.length,
      itemsTriaged: x.items.filter((i) => i.triage).length,
      itemsEscalated: x.items.filter((i) => i.routing?.escalate).length,
      routingCounts,
      droppedStatements: [...x.explanations.values()].reduce((s, e) => s + e.dropped.count, 0),
      totals: totalsOf(x.calls, x.tavilyCredits),
    },
    generatedAt: x.now.toISOString(),
  };
}

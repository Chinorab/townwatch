// Deterministic routing rule (FR-011, contracts/pipeline-stages.md). No model call here: which
// items reach Ultra is decided by code, recorded per item with its reason, and unit-tested.
import type { AgendaItem, Routing, Topic } from "@/lib/schemas";

export const ESCALATION_TOPICS: ReadonlySet<Topic> = new Set([
  "taxes",
  "budget_spending",
  "water_utilities",
  "roads_transport",
  "schools",
  "zoning_land_use",
]);
export const CAP_SHARE = 0.25;

const IMPACT_RANK = { low: 0, medium: 1, high: 2 } as const;

export function route(items: AgendaItem[]): AgendaItem[] {
  const decided = new Map<string, Routing>();
  const candidates: AgendaItem[] = [];

  for (const it of items) {
    const t = it.triage;
    if (!t || (!t.routine && !t.decisionExpected)) decided.set(it.itemHash, { escalate: false, reason: "info_only" });
    else if (t.routine) decided.set(it.itemHash, { escalate: false, reason: "routine" });
    else if (t.impact !== "low" || ESCALATION_TOPICS.has(t.topic)) candidates.push(it);
    else decided.set(it.itemHash, { escalate: false, reason: "low_impact" });
  }

  const cap = Math.max(1, Math.ceil(CAP_SHARE * items.length));
  candidates
    .sort((a, b) => IMPACT_RANK[b.triage!.impact] - IMPACT_RANK[a.triage!.impact] || b.triage!.importance - a.triage!.importance)
    .forEach((it, i) => decided.set(it.itemHash, i < cap ? { escalate: true, reason: "rule_match" } : { escalate: false, reason: "cap" }));

  return items.map((it) => ({ ...it, routing: decided.get(it.itemHash)! }));
}

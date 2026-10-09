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
/** Absolute cap per place: a city council agenda runs to 120 items, and 25% of that would cost
 *  about $0.30 of Ultra for one place (SC-005 targets under $0.25 per new place). */
export const CAP_MAX = 12;

const IMPACT_RANK = { low: 0, medium: 1, high: 2 } as const;

/** Items of one meeting that differ only by numbers or a parcel label ("Resolution 26-21 ...
 *  Crawford Place Lane Labeled Tract 2") are one decision taken several times: the first is
 *  explained, the others are listed as written and do not use the cap. */
export function seriesKey(it: AgendaItem): string | null {
  const words = it.title
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .split(" ")
    .filter((w) => w && !/^(tract|parcel|lot|phase|unit|no|number|labeled|labelled|as|part|portion)$/.test(w));
  const key = words.join(" ");
  return key.length >= 20 ? `${it.meetingId}|${key}` : null;
}

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

  const cap = Math.min(CAP_MAX, Math.max(1, Math.ceil(CAP_SHARE * items.length)));
  const seen = new Set<string>();
  let escalated = 0;
  candidates
    .sort((a, b) => IMPACT_RANK[b.triage!.impact] - IMPACT_RANK[a.triage!.impact] || b.triage!.importance - a.triage!.importance)
    .forEach((it) => {
      const key = seriesKey(it);
      if (key && seen.has(key)) return decided.set(it.itemHash, { escalate: false, reason: "series" });
      if (key) seen.add(key);
      decided.set(it.itemHash, escalated++ < cap ? { escalate: true, reason: "rule_match" } : { escalate: false, reason: "cap" });
    });

  return items.map((it) => ({ ...it, routing: decided.get(it.itemHash)! }));
}

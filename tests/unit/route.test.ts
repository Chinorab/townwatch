import { describe, expect, it } from "vitest";
import { route } from "@/pipeline/stages/route";
import type { AgendaItem, Triage } from "@/lib/schemas";

function item(id: string, t: Partial<Triage>): AgendaItem {
  return {
    itemHash: id,
    number: id,
    title: id,
    text: id,
    meetingId: "m",
    docHash: "d",
    docUrl: "u",
    page: null,
    triage: { topic: "other", routine: false, decisionExpected: true, impact: "low", locationsMentioned: [], importance: 1, ...t },
  };
}

const reasons = (items: AgendaItem[]) => Object.fromEntries(route(items).map((i) => [i.itemHash, i.routing!.reason]));

describe("route (FR-011)", () => {
  it("never escalates routine items, even high impact ones", () => {
    expect(reasons([item("a", { routine: true, impact: "high", topic: "taxes" }), ...fill(3)]).a).toBe("routine");
  });

  it("does not escalate information-only items", () => {
    expect(reasons([item("a", { decisionExpected: false, impact: "high" }), ...fill(3)]).a).toBe("info_only");
  });

  it("escalates a decision with medium or high impact", () => {
    expect(reasons([item("a", { impact: "medium" }), ...fill(3)]).a).toBe("rule_match");
  });

  it("escalates a low-impact decision when the topic is on the list", () => {
    for (const topic of ["taxes", "budget_spending", "water_utilities", "roads_transport", "schools", "zoning_land_use"] as const) {
      expect(reasons([item("a", { topic }), ...fill(3)]).a).toBe("rule_match");
    }
  });

  it("leaves a low-impact decision on another topic as low_impact", () => {
    expect(reasons([item("a", { topic: "public_safety" }), ...fill(3)]).a).toBe("low_impact");
  });

  it("caps escalations at 25% of all items, keeping highest impact then importance", () => {
    const items = [
      item("low-topic", { topic: "roads_transport", impact: "low", importance: 5 }),
      item("high-1", { impact: "high", importance: 2 }),
      item("high-5", { impact: "high", importance: 5 }),
      item("med", { impact: "medium", importance: 4 }),
      ...fill(4),
    ];
    const r = reasons(items); // 8 items → cap 2
    expect(r["high-5"]).toBe("rule_match");
    expect(r["high-1"]).toBe("rule_match");
    expect(r["med"]).toBe("cap");
    expect(r["low-topic"]).toBe("cap");
    expect(route(items).filter((i) => i.routing!.escalate)).toHaveLength(2);
  });

  it("escalates at least one item when there are fewer than four", () => {
    expect(reasons([item("a", { impact: "high" })]).a).toBe("rule_match");
  });

  it("treats an item without triage as not escalated (info_only)", () => {
    const bare = { ...item("a", {}), triage: undefined };
    expect(route([bare])[0].routing).toEqual({ escalate: false, reason: "info_only" });
  });
});

function fill(n: number): AgendaItem[] {
  return Array.from({ length: n }, (_, i) => item(`filler-${i}`, { routine: true }));
}

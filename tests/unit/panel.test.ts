// T061: "How this was made" figures (FR-018, US5) add up.
import { describe, expect, it } from "vitest";
import { totalsOf } from "@/pipeline/stages/assemble";
import { panelView } from "@/components/panel/panel";
import type { ModelCall } from "@/lib/schemas";

const call = (model: string, input: number, output: number, reasoning: number, costUsd: number, stage: ModelCall["stage"]): ModelCall => ({
  stage,
  model,
  inputTokens: input,
  outputTokens: output,
  reasoningTokens: reasoning,
  ms: 100,
  costUsd,
  ok: true,
  fallbackFrom: null,
  ref: null,
  at: "2026-10-08T00:00:00Z",
});

const calls = [
  call("nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", 1000, 300, 0, 0.0001, "triage"),
  call("nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", 800, 200, 0, 0.00008, "verify"),
  call("nvidia/Nemotron-3-Ultra-550b-a55b", 900, 4000, 3500, 0.0129, "explain"),
];

describe("panel totals", () => {
  it("sums tokens and cost per model and overall", () => {
    const t = totalsOf(calls, 7);
    expect(t.calls).toBe(3);
    expect(t.tokensByModel["nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B"]).toMatchObject({ input: 1800, output: 500, calls: 2 });
    expect(t.tokensByModel["nvidia/Nemotron-3-Ultra-550b-a55b"].reasoning).toBe(3500);
    expect(t.costUsd).toBeCloseTo(0.01308, 8);
    expect(t.tavilyCredits).toBe(7);
  });

  it("names models plainly, flags estimated prices and orders small to large", () => {
    const v = panelView(totalsOf(calls, 7));
    expect(v.models.map((x) => x.label)).toEqual(["Nemotron 3 Nano 30B", "Nemotron 3 Ultra 550B"]);
    expect(v.models[1].share).toBeGreaterThan(0.9);
    expect(v.pricesAreEstimates).toBe(true);
  });
});

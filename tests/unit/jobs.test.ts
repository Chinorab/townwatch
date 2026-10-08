// T041: the analysis state machine, replayed on the real Edgecombe recording.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MemoryKV } from "@/lib/store";
import { Models } from "@/lib/models";
import { Tavily } from "@/lib/tavily";
import { placeFromId } from "@/lib/places";
import { replay, type Tape } from "@/pipeline/recording";
import { advance, createAnalysis, getAnalysis } from "@/pipeline/jobs";
import type { Ctx } from "@/pipeline/context";
import type { Briefing } from "@/lib/schemas";

const tape: Tape = JSON.parse(readFileSync("tests/fixtures/recorded/edgecombe-2026-10-08.json", "utf8"));

function ctxWith(kv: MemoryKV, t: Tape = tape): Ctx {
  const r = replay(t);
  return {
    kv,
    models: new Models(r.transport, { fast: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", explain: "nvidia/Nemotron-3-Ultra-550b-a55b", fallback: "nvidia/nemotron-3-super-120b-a12b", timeoutMs: {} }),
    tavily: new Tavily(r.post),
    fetcher: r.fetcher,
    now: new Date(t.now!),
    log: () => {},
  };
}

describe("analysis jobs", () => {
  it("moves through every stage in bounded steps and ends with a briefing", async () => {
    const kv = new MemoryKV();
    const ctx = ctxWith(kv);
    const a = await createAnalysis(ctx, placeFromId("nc-edgecombe-county"));
    expect(a.status).toBe("queued");
    const seen: string[] = [];
    let current = a;
    for (let i = 0; i < 20 && !["done", "failed"].includes(current.status); i++) {
      const r = await advance(ctx, a.analysisId);
      if (r === "locked") throw new Error("unexpected lock");
      current = r;
      seen.push(current.status);
    }
    expect(current.status).toBe("done");
    expect(seen).toEqual(expect.arrayContaining(["reading", "triaging", "explaining", "assembling", "done"]));
    expect(current.progress.itemsTriaged).toBe(73);
    expect(current.progress.itemsExplained).toBe(current.progress.itemsEscalated);
    expect(current.totals.calls).toBeGreaterThan(0);
    const b = await kv.get<Briefing>("briefing:nc-edgecombe-county");
    expect(b?.analysisId).toBe(a.analysisId);
  }, 60_000);

  it("explains at most 4 items per step", async () => {
    const kv = new MemoryKV();
    const ctx = ctxWith(kv);
    const a = await createAnalysis(ctx, placeFromId("nc-edgecombe-county"));
    let current = a;
    while (current.status !== "explaining") current = (await advance(ctx, a.analysisId)) as typeof a;
    const before = current.progress.itemsExplained;
    current = (await advance(ctx, a.analysisId)) as typeof a;
    expect(current.progress.itemsExplained - before).toBeLessThanOrEqual(4);
  }, 60_000);

  it("refuses a second advance while one holds the lock", async () => {
    const kv = new MemoryKV();
    const ctx = ctxWith(kv);
    const a = await createAnalysis(ctx, placeFromId("nc-edgecombe-county"));
    await kv.setNx(`lock:analysis:${a.analysisId}`, "other", 60_000);
    expect(await advance(ctx, a.analysisId)).toBe("locked");
  });

  it("marks the analysis failed with a reason instead of throwing", async () => {
    const kv = new MemoryKV();
    const ctx = ctxWith(kv, { models: {}, tavily: {}, fetch: {}, now: tape.now }); // nothing recorded: every call fails
    const a = await createAnalysis(ctx, placeFromId("nc-edgecombe-county"));
    const r = await advance(ctx, a.analysisId);
    expect(r).not.toBe("locked");
    expect((r as typeof a).status).toBe("failed");
    expect((await getAnalysis(kv, a.analysisId))!.error).toMatch(/Tavily|recorded/);
  });
});

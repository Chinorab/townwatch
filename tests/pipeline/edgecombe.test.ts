// T020: the whole pipeline, discover → assemble, replayed offline from a recording of the real
// run of 2026-10-08 on Edgecombe County, NC (Tavily, downloads and Nemotron replies included).
import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { MemoryKV } from "@/lib/store";
import { Models } from "@/lib/models";
import { Tavily } from "@/lib/tavily";
import { placeFromId } from "@/lib/places";
import { replay, type Tape } from "@/pipeline/recording";
import { analysePlace } from "@/pipeline/jobs";
import type { Ctx } from "@/pipeline/context";
import { NOT_STATED, type Briefing } from "@/lib/schemas";

const tape: Tape = JSON.parse(readFileSync("tests/fixtures/recorded/edgecombe-2026-10-08.json", "utf8"));

let briefing: Briefing;
let kv: MemoryKV;

beforeAll(async () => {
  const r = replay(tape);
  kv = new MemoryKV();
  const ctx: Ctx = {
    kv,
    models: new Models(r.transport, {
      fast: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
      explain: "nvidia/Nemotron-3-Ultra-550b-a55b",
      fallback: "nvidia/nemotron-3-super-120b-a12b",
      timeoutMs: {},
    }),
    tavily: new Tavily(r.post),
    fetcher: r.fetcher,
    now: new Date(tape.now!),
    log: () => {},
  };
  briefing = (await analysePlace(ctx, placeFromId("nc-edgecombe-county"))).briefing;
}, 60_000);

describe("Edgecombe County briefing replayed from the real run", () => {
  it("covers the commissioners and the school board from official sources", () => {
    const covered = briefing.bodies.filter((b) => b.coverage === "covered").map((b) => b.role);
    expect(covered).toEqual(expect.arrayContaining(["county_executive", "school_board"]));
    for (const s of briefing.panel.sourcesKept) expect(s.url).toMatch(/edgecombecountync\.gov|ecps\.us/);
  });

  it("rejects wrong-place candidates with a reason", () => {
    expect(briefing.panel.sourcesRejected.length).toBeGreaterThan(0);
    for (const r of briefing.panel.sourcesRejected) expect(r.reason.length).toBeGreaterThan(0);
  });

  it("marks a verified page without dated agendas as not found", () => {
    const planning = briefing.bodies.find((b) => b.role === "planning")!;
    expect(planning.coverage).toBe("not_found");
  });

  it("explains item 4.8, the Rocky Mount water system resolution", () => {
    const h = briefing.headlineItems.find((x) => x.item.number === "4.8");
    expect(h).toBeDefined();
    expect(h!.meeting.date).toBe("2026-10-05");
    expect(h!.explanation.statements.length).toBeGreaterThanOrEqual(3);
  });

  it("cites every statement: document link, item number, verbatim quote (principle I)", () => {
    for (const h of briefing.headlineItems) {
      const statements = [h.explanation.headline, ...h.explanation.statements].filter(Boolean);
      for (const s of statements) {
        expect(s!.citation.docUrl).toBe(h.item.docUrl);
        expect(s!.citation.itemNumber).toBe(h.item.number);
        expect(s!.citation.quote.length).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it("states amounts only when they appear in the item text (principle III)", () => {
    for (const h of briefing.headlineItems) {
      const amount = h.explanation.fields.amount;
      if (amount === NOT_STATED) continue;
      for (const n of amount.match(/\d[\d,]*(?:\.\d+)?/g) ?? []) expect(h.item.text.replace(/,/g, "")).toContain(n.replace(/,/g, ""));
    }
  });

  it("uses no opinion words in any statement (principle II)", () => {
    const opinion = /\b(should|unfortunately|fortunately|alarming|controversial|shocking|wasteful|great news|we recommend)\b/i;
    for (const h of briefing.headlineItems) {
      for (const s of h.explanation.statements) if (opinion.test(s.text)) expect(s.citation.quote).toMatch(opinion);
    }
  });

  it("escalates at most 25% of items, and lists the rest verbatim", () => {
    expect(briefing.panel.itemsEscalated).toBeLessThanOrEqual(Math.ceil(0.25 * briefing.panel.itemsTotal));
    expect(briefing.alsoOnAgenda.length + briefing.headlineItems.length).toBeLessThanOrEqual(briefing.panel.itemsTotal);
    for (const a of briefing.alsoOnAgenda) expect(a.title.length).toBeGreaterThan(0);
  });

  it("meters every model call into the panel", () => {
    const t = briefing.panel.totals;
    const sum = Object.values(t.tokensByModel).reduce((s, m) => s + m.costUsd, 0);
    expect(t.costUsd).toBeCloseTo(sum, 10);
    expect(t.calls).toBe(Object.keys(tape.models).length);
    expect(Object.keys(t.tokensByModel)).toEqual(expect.arrayContaining(["nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", "nvidia/Nemotron-3-Ultra-550b-a55b"]));
  });

  it("costs nothing the second time: everything is cached", async () => {
    const before = ((await kv.get<unknown[]>("calls:nc-edgecombe-county")) ?? []).length;
    const r = replay({ models: {}, tavily: {}, fetch: {} });
    const ctx: Ctx = {
      kv,
      models: new Models(r.transport, { fast: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B", explain: "nvidia/Nemotron-3-Ultra-550b-a55b", fallback: "nvidia/nemotron-3-super-120b-a12b", timeoutMs: {} }),
      tavily: new Tavily(r.post),
      fetcher: r.fetcher,
      now: new Date(tape.now!),
      log: () => {},
    };
    const again = await analysePlace(ctx, placeFromId("nc-edgecombe-county"));
    expect(again.newCalls).toHaveLength(0);
    expect(again.newTavilyCredits).toBe(0);
    expect(((await kv.get<unknown[]>("calls:nc-edgecombe-county")) ?? []).length).toBe(before);
    expect(again.briefing.headlineItems.map((h) => h.item.number)).toEqual(briefing.headlineItems.map((h) => h.item.number));
  });
});

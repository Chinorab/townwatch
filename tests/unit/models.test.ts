import { describe, expect, it } from "vitest";
import { z } from "zod";
import { Models, ModelOutputError, extractJson, type Completion, type ModelConfig, type Transport } from "@/lib/models";
import { costUsd } from "@/lib/prices";

const config: ModelConfig = {
  fast: "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
  explain: "nvidia/Nemotron-3-Ultra-550b-a55b",
  fallback: "nvidia/nemotron-3-super-120b-a12b",
  timeoutMs: {},
};
const Out = z.object({ ok: z.boolean() });

const reply = (content: string, usage: Completion["usage"]): Completion => ({ choices: [{ message: { content } }], usage });

describe("extractJson", () => {
  it("reads fenced JSON and JSON surrounded by prose", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Here you go: [{"a":1}] done')).toEqual([{ a: 1 }]);
  });
  it("throws when there is no JSON", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("Models", () => {
  it("records usage when completion_tokens_details is null (Nano shape)", async () => {
    const t: Transport = async () => reply('{"ok":true}', { prompt_tokens: 76, completion_tokens: 11, completion_tokens_details: null });
    const m = new Models(t, config);
    await m.chatJson({ stage: "triage", tier: "fast", system: "s", user: "u", schema: Out, maxTokens: 50 });
    expect(m.calls[0]).toMatchObject({ model: config.fast, inputTokens: 76, outputTokens: 11, reasoningTokens: 0, ok: true, fallbackFrom: null });
  });

  it("counts reasoning tokens and prices them as output (Ultra shape)", async () => {
    const t: Transport = async () => reply('{"ok":true}', { prompt_tokens: 76, completion_tokens: 699, completion_tokens_details: { reasoning_tokens: 685 } });
    const m = new Models(t, config);
    await m.chatJson({ stage: "explain", tier: "explain", system: "s", user: "u", schema: Out, maxTokens: 900 });
    expect(m.calls[0].reasoningTokens).toBe(685);
    expect(m.calls[0].costUsd).toBeCloseTo(costUsd(config.explain, 76, 699), 10);
    expect(m.calls[0].costUsd).toBeCloseTo((76 * 1 + 699 * 3) / 1e6, 10);
  });

  it("sends thinking off for the fast tier only", async () => {
    const seen: unknown[] = [];
    const t: Transport = async (req) => {
      seen.push(req.chat_template_kwargs);
      return reply('{"ok":true}', {});
    };
    const m = new Models(t, config);
    await m.chatJson({ stage: "triage", tier: "fast", system: "s", user: "u", schema: Out, maxTokens: 50 });
    await m.chatJson({ stage: "explain", tier: "explain", system: "s", user: "u", schema: Out, maxTokens: 50 });
    expect(seen).toEqual([{ enable_thinking: false }, undefined]);
  });

  it("falls back from Ultra to Super on timeout and records both calls", async () => {
    const t: Transport = async (req) => {
      if (req.model === config.explain) throw Object.assign(new Error("Request timed out."), { name: "APIConnectionTimeoutError" });
      return reply('{"ok":true}', { prompt_tokens: 10, completion_tokens: 5 });
    };
    const m = new Models(t, config);
    const out = await m.chatJson({ stage: "explain", tier: "explain", system: "s", user: "u", schema: Out, maxTokens: 50 });
    expect(out).toEqual({ ok: true });
    expect(m.calls.map((c) => [c.model, c.ok, c.fallbackFrom])).toEqual([
      [config.explain, false, null],
      [config.fallback, true, config.explain],
    ]);
  });

  it("falls back to Super when Ultra returns no JSON (reasoning ran out of tokens)", async () => {
    const t: Transport = async (req) =>
      req.model === config.explain
        ? reply("The user wants me to explain one agenda item...", { prompt_tokens: 700, completion_tokens: 6000, completion_tokens_details: { reasoning_tokens: 6000 } })
        : reply('{"ok":true}', { prompt_tokens: 700, completion_tokens: 40 });
    const m = new Models(t, config);
    expect(await m.chatJson({ stage: "explain", tier: "explain", system: "s", user: "u", schema: Out, maxTokens: 6000 })).toEqual({ ok: true });
    expect(m.calls.map((c) => [c.model, c.ok])).toEqual([
      [config.explain, false],
      [config.fallback, true],
    ]);
  });

  it("does not fall back on a client error (400)", async () => {
    const t: Transport = async () => {
      throw Object.assign(new Error("bad request"), { status: 400 });
    };
    const m = new Models(t, config);
    await expect(m.chatJson({ stage: "explain", tier: "explain", system: "s", user: "u", schema: Out, maxTokens: 50 })).rejects.toThrow("bad request");
    expect(m.calls).toHaveLength(1);
  });

  it("raises ModelOutputError on schema mismatch but still meters the call", async () => {
    const t: Transport = async () => reply('{"ok":"yes"}', { prompt_tokens: 5, completion_tokens: 3 });
    const m = new Models(t, config);
    await expect(m.chatJson({ stage: "triage", tier: "fast", system: "s", user: "u", schema: Out, maxTokens: 50 })).rejects.toBeInstanceOf(ModelOutputError);
    expect(m.calls[0]).toMatchObject({ ok: false, inputTokens: 5 });
  });
});

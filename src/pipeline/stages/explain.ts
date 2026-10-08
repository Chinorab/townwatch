// Escalation: Nemotron 3 Ultra (reasoning on) explains one important item in plain English,
// with a verbatim quote for every statement. Super takes over on timeout or server error.
// The raw draft is cached; grounding runs on every assembly, so rule changes cost nothing.
import { ExplanationDraft, NOT_STATED, type AgendaItem } from "@/lib/schemas";
import type { Ctx } from "../context";

const MAX_TEXT = 6_000;
/** Bump when the prompt changes: older cached drafts are then ignored. */
export const EXPLAIN_VERSION = "v2";

const SYSTEM = `You explain one item of a US local government meeting agenda to residents, in plain English that anyone can read.
Strict rules:
1. Neutral: say what is proposed or decided, by whom, when, and what it changes. Never give an opinion, never recommend a position, never use loaded or emotional words.
2. Nothing invented: use only facts written in the SOURCE below. If a date, amount, place, body or public comment rule is not written there, use exactly "${NOT_STATED}".
3. Every statement carries a "quote": a short span copied character for character from the SOURCE that supports it.
4. Short sentences, under 30 words each. No dashes. No jargon without a plain explanation.
5. Write 3 to 5 statements chosen among kinds: "what" (what is proposed), "who" (which body decides), "when" (meeting date and time), "change" (what changes concretely for residents if approved), "participate" (how residents can speak, comment or attend a public hearing on this item, only if the SOURCE says so; accessibility notices are not participation rules).
6. The headline is a plain factual sentence about this item, under 15 words, without the meeting date.
Answer with JSON only:
{"headline": {"text": string, "quote": string},
 "statements": [{"kind": "what"|"who"|"when"|"change"|"participate", "text": string, "quote": string}],
 "fields": {"meetingDate": string, "amount": string, "place": string, "body": string, "commentRules": string}}`;

export interface ExplainInput {
  item: AgendaItem;
  bodyName: string;
  placeLabel: string;
  meetingDate: string;
  meetingTime: string | null;
  meetingLocation: string | null;
  header: string;
}

export async function explainOne(ctx: Ctx, input: ExplainInput): Promise<{ draft: ExplanationDraft; model: string } | null> {
  const key = `draft:${EXPLAIN_VERSION}:${ctx.models.config.explain}:${input.item.itemHash}`;
  const hit = await ctx.kv.get<{ draft: ExplanationDraft; model: string }>(key);
  if (hit) return hit;
  const user = `Place: ${input.placeLabel}
Body: ${input.bodyName}
Meeting date from the record: ${input.meetingDate}
Meeting time from the record: ${input.meetingTime ?? NOT_STATED}
Meeting location from the record: ${input.meetingLocation ?? NOT_STATED}

SOURCE (document header, then the agenda item):
${input.header}

Item ${input.item.number}:
${input.item.text.slice(0, MAX_TEXT)}`;
  const before = ctx.models.calls.length;
  try {
    const draft = await ctx.models.chatJson({ stage: "explain", tier: "explain", system: SYSTEM, user, schema: ExplanationDraft, maxTokens: 6_000, ref: input.item.itemHash });
    const model = ctx.models.calls.slice(before).filter((c) => c.ok).at(-1)?.model ?? ctx.models.config.explain;
    const value = { draft, model };
    await ctx.kv.set(key, value);
    return value;
  } catch (err) {
    ctx.log(`explain failed for item ${input.item.number}: ${String(err).slice(0, 160)}`);
    return null;
  }
}

/** Runs explainOne over many items, at most `limit` at a time. */
export async function explainAll(ctx: Ctx, inputs: ExplainInput[], limit = 4) {
  const results = new Map<string, { draft: ExplanationDraft; model: string } | null>();
  let next = 0;
  async function worker() {
    while (next < inputs.length) {
      const input = inputs[next++];
      results.set(input.item.itemHash, await explainOne(ctx, input));
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, inputs.length) }, worker));
  return results;
}

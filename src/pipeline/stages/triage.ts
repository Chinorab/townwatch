// Bulk triage with the fast Nemotron model, thinking off, about 10 items per call (FR-009).
// Results are cached per item and model: an item is never triaged twice.
import { z } from "zod";
import { ModelOutputError } from "@/lib/models";
import { TOPICS, type AgendaItem, type Triage } from "@/lib/schemas";
import type { Ctx } from "../context";

export const BATCH = 10;
const MAX_TEXT = 1_500;
/** Bump when the prompt changes: cached triage from an older prompt is then ignored. */
export const TRIAGE_VERSION = "v2";

const SYSTEM = `You sort items from a US local government meeting agenda for residents.
Answer with a JSON array only, one object per item, same order, no prose:
[{"id": string, "topic": one of ${JSON.stringify(TOPICS)}, "routine": boolean, "decisionExpected": boolean, "impact": "low" | "medium" | "high", "locationsMentioned": string[], "importance": integer 1 to 5}]
Definitions:
- topic: the subject that matters to residents. Use "schools" only for changes to how schools serve students and families (closures, boundaries, calendars, curriculum, school buildings, school budgets); "water_utilities" for water, sewer, electricity, broadband; "taxes" only for tax rates, levies, assessments or tax appeals. Personnel, field trips, fundraisers and small vendor services are "other".
- routine: procedural, ceremonial or administrative: call to order, roll call, invocation, pledge, approval of the agenda or of previous minutes, proclamations, recognitions, retirements, appointments to advisory boards, personnel lists, field trips, fundraisers, student transfers, adjournment, reports with no action, closed session notices.
- decisionExpected: the body is asked to vote, approve, adopt, award, accept, deny or set a public hearing on this item at this meeting.
- impact on residents: low = internal administration, staff reports, routine purchases and small grants; medium = affects a neighbourhood, a group of residents, local services, fees or a large contract; high = taxes or utility rates, large spending, sale or purchase of public property, land use or zoning changes, school closures or boundaries, public safety changes affecting many residents.
- locationsMentioned: street names, addresses, subdivisions, parcels, landmarks or facilities named in the item, copied exactly as written; [] if none.
- importance: 1 (minor) to 5 (most significant for residents of this place).
Judge only from the item text. Do not guess facts that are not written.`;

const Out = z.array(
  z.object({
    id: z.string(),
    topic: z.string(),
    routine: z.boolean(),
    decisionExpected: z.boolean(),
    impact: z.enum(["low", "medium", "high"]),
    locationsMentioned: z.array(z.string()).nullish(),
    importance: z.number(),
  }),
);

function normalizeTriage(o: z.infer<typeof Out>[number]): Triage {
  return {
    topic: (TOPICS as readonly string[]).includes(o.topic) ? (o.topic as Triage["topic"]) : "other",
    routine: o.routine,
    decisionExpected: o.decisionExpected,
    impact: o.impact,
    locationsMentioned: (o.locationsMentioned ?? []).filter((s) => s.trim().length > 1),
    importance: Math.min(5, Math.max(1, Math.round(o.importance))),
  };
}

export interface MeetingInfo {
  body: string;
  date: string;
}

async function triageBatch(ctx: Ctx, batch: AgendaItem[], meetings: Map<string, MeetingInfo>): Promise<Map<string, Triage>> {
  const user = batch
    .map((it, i) => {
      const m = meetings.get(it.meetingId);
      return `id: i${i + 1}\nmeeting: ${m?.body ?? "unknown body"}, ${m?.date ?? "unknown date"}\nitem ${it.number}: ${it.text.slice(0, MAX_TEXT).replace(/\s+/g, " ")}`;
    })
    .join("\n\n");
  const ask = (extra = "") =>
    ctx.models.chatJson({ stage: "triage", tier: "fast", system: SYSTEM + extra, user, schema: Out, maxTokens: 120 * batch.length + 200, ref: batch[0].itemHash });
  let out: z.infer<typeof Out>;
  try {
    out = await ask();
  } catch (err) {
    if (!(err instanceof ModelOutputError)) throw err;
    out = await ask("\nYour previous answer was not valid. Return only the JSON array with exactly one object per item.");
  }
  const result = new Map<string, Triage>();
  out.forEach((o, i) => {
    const idx = Number(o.id.replace(/\D/g, "")) - 1;
    const it = batch[Number.isInteger(idx) && idx >= 0 && idx < batch.length ? idx : i];
    if (it) result.set(it.itemHash, normalizeTriage(o));
  });
  return result;
}

export async function triage(ctx: Ctx, items: AgendaItem[], meetings: Map<string, MeetingInfo>): Promise<AgendaItem[]> {
  const model = ctx.models.config.fast;
  const done = new Map<string, Triage>();
  const todo: AgendaItem[] = [];
  for (const it of items) {
    const hit = await ctx.kv.get<Triage>(`triage:${TRIAGE_VERSION}:${model}:${it.itemHash}`);
    if (hit) done.set(it.itemHash, hit);
    else todo.push(it);
  }
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    try {
      const res = await triageBatch(ctx, batch, meetings);
      for (const [hash, t] of res) {
        done.set(hash, t);
        await ctx.kv.set(`triage:${TRIAGE_VERSION}:${model}:${hash}`, t);
      }
    } catch (err) {
      ctx.log(`triage batch failed (${batch.length} items left untriaged): ${String(err).slice(0, 160)}`);
    }
  }
  return items.map((it) => ({ ...it, triage: done.get(it.itemHash) }));
}

// Limits on new places (FR-024, FR-025): 10 per day for everyone, 1 per visitor per day, and a
// safety stop when recorded model spend reaches 12 USD. A visitor is a salted hash of the IP
// address; the salt changes daily and every counter expires, so no address is ever stored.
import { randomBytes } from "node:crypto";
import { sha256, type KV } from "./store";

export const DAILY_NEW_PLACES = 10;
export const PER_VISITOR_PER_DAY = 1;
export const BUDGET_STOP_USD = 12;

export type LimitCode = "visitor_limit" | "daily_limit" | "budget_stop";

const day = (now: Date) => now.toISOString().slice(0, 10);

async function visitorKey(kv: KV, ip: string, now: Date): Promise<string> {
  const saltKey = `salt:${day(now)}`;
  await kv.setNx(saltKey, randomBytes(16).toString("hex"), 48 * 3_600_000);
  const salt = (await kv.get<string>(saltKey)) ?? "";
  return `visitor:${day(now)}:${sha256(`${salt}|${ip}`)}`;
}

export async function checkNewPlace(kv: KV, ip: string, now: Date): Promise<{ ok: true } | { ok: false; code: LimitCode }> {
  if (((await kv.get<number>("ledger:total")) ?? 0) >= BUDGET_STOP_USD) return { ok: false, code: "budget_stop" };
  if (((await kv.get<number>(`global:newplaces:${day(now)}`)) ?? 0) >= DAILY_NEW_PLACES) return { ok: false, code: "daily_limit" };
  if (((await kv.get<number>(await visitorKey(kv, ip, now))) ?? 0) >= PER_VISITOR_PER_DAY) return { ok: false, code: "visitor_limit" };
  return { ok: true };
}

export async function recordNewPlace(kv: KV, ip: string, now: Date): Promise<void> {
  await kv.incr(`global:newplaces:${day(now)}`, 48 * 3_600);
  await kv.incr(await visitorKey(kv, ip, now), 24 * 3_600);
}

export const LIMIT_MESSAGES: Record<LimitCode, string> = {
  visitor_limit: "You can start one new place per day. The places below are ready to read now.",
  daily_limit: "Today's new places have all been used. The places below are ready to read now, and new places open again tomorrow.",
  budget_stop: "New places are paused for now. Every place below stays available.",
};

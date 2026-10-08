// T042: limits on new places (FR-024, FR-025), with no personal data kept.
import { describe, expect, it } from "vitest";
import { MemoryKV } from "@/lib/store";
import { BUDGET_STOP_USD, DAILY_NEW_PLACES, checkNewPlace, recordNewPlace } from "@/lib/limits";

const now = new Date("2026-10-08T12:00:00Z");

describe("new-place limits", () => {
  it("allows a visitor's first new place, then refuses the second the same day", async () => {
    const kv = new MemoryKV();
    expect(await checkNewPlace(kv, "203.0.113.7", now)).toEqual({ ok: true });
    await recordNewPlace(kv, "203.0.113.7", now);
    expect(await checkNewPlace(kv, "203.0.113.7", now)).toEqual({ ok: false, code: "visitor_limit" });
    expect(await checkNewPlace(kv, "198.51.100.4", now)).toEqual({ ok: true });
  });

  it("stops everyone after the daily global limit", async () => {
    const kv = new MemoryKV();
    for (let i = 0; i < DAILY_NEW_PLACES; i++) await recordNewPlace(kv, `192.0.2.${i}`, now);
    expect(await checkNewPlace(kv, "192.0.2.200", now)).toEqual({ ok: false, code: "daily_limit" });
    expect(await checkNewPlace(kv, "192.0.2.200", new Date("2026-10-09T12:00:00Z"))).toEqual({ ok: true });
  });

  it("stops all new analyses once recorded spend reaches the safety stop", async () => {
    const kv = new MemoryKV();
    await kv.incrByFloat("ledger:total", BUDGET_STOP_USD);
    expect(await checkNewPlace(kv, "203.0.113.7", now)).toEqual({ ok: false, code: "budget_stop" });
  });

  it("never stores the IP address itself", async () => {
    const kv = new MemoryKV();
    await recordNewPlace(kv, "203.0.113.7", now);
    const dump = JSON.stringify([...(kv as unknown as { m: Map<string, unknown> }).m.entries()]);
    expect(dump).not.toContain("203.0.113.7");
  });
});

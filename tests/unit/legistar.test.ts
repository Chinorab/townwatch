import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { legistarReader, legistarItems } from "@/pipeline/readers/legistar";
import { testContext } from "@/pipeline/context";
import type { Source } from "@/lib/schemas";

const events = readFileSync("tests/fixtures/annarbor-legistar-events.json");
const items14160 = readFileSync("tests/fixtures/annarbor-legistar-eventitems-14160.json");
const ok = (b: Buffer) => ({ status: 200, contentType: "application/json", bytes: new Uint8Array(b) });

const source = (role: Source["role"]): Source => ({
  sourceId: "s",
  role,
  url: "https://a2gov.legistar.com/Calendar.aspx",
  host: "a2gov.legistar.com",
  platform: "legistar",
  platformKey: "a2gov",
  verification: { url: "", official: true, rightPlace: true, rightBody: true, confidence: 1, reason: "", bodyName: "City Council" },
  accepted: true,
  checkedAt: "",
});

describe("Legistar reader on the real Ann Arbor API responses", () => {
  const calls: string[] = [];
  const ctx = testContext({
    fetcher: async (url) => {
      calls.push(url);
      if (/\/events\/14160\/eventitems/.test(url)) return ok(items14160);
      if (/\/events\?/.test(url)) return ok(events);
      return { status: 404, contentType: "text/plain", bytes: new Uint8Array() };
    },
  });

  it("keeps the City Council meeting and leaves committees and authorities out", async () => {
    const meetings = await legistarReader.list(ctx, source("executive"), { from: "2026-09-24", to: "2026-10-29" });
    expect(meetings.map((m) => m.bodyName)).toEqual(["City Council"]);
    const m = meetings[0];
    expect(m.date).toBe("2026-10-05");
    expect(m.time).toBe("7:00 PM");
    expect(m.location).toContain("Larcom City Hall");
    expect(m.agendaUrl).toMatch(/^https:\/\/a2gov\.legistar1?\.com\/.*Agenda\.pdf$/);
    expect(calls[0]).toMatch(/^https:\/\/webapi\.legistar\.com\/v1\/a2gov\/events\?/);
  });

  it("returns numbered items, without section headers and without duplicate matters", async () => {
    const [m] = await legistarReader.list(ctx, source("executive"), { from: "2026-09-24", to: "2026-10-29" });
    const numbers = m.items!.map((i) => i.number);
    expect(numbers).toContain("CA-7");
    expect(numbers).toContain("PH-1");
    expect(numbers).not.toContain("PH"); // header with children
    expect(numbers).not.toContain("B-1"); // same matter as PH-1
    expect(m.items!.find((i) => i.number === "CA-7")!.title).toBe("Resolution to Rename 2570 Dexter Avenue Park to Dr. George Henry Jewett II Park");
  });

  it("finds no meeting for a body the portal does not host", async () => {
    expect(await legistarReader.list(ctx, source("school_board"), { from: "2026-09-24", to: "2026-10-29" })).toEqual([]);
  });
});

describe("legistarItems", () => {
  it("keeps a lettered header when it has no sub-items", () => {
    const rows = [
      { EventItemAgendaSequence: 1, EventItemAgendaNumber: "A", EventItemTitle: "APPROVAL OF COUNCIL MINUTES", EventItemMatterId: null },
      { EventItemAgendaSequence: 2, EventItemAgendaNumber: "B", EventItemTitle: "ORDINANCES", EventItemMatterId: null },
      { EventItemAgendaSequence: 3, EventItemAgendaNumber: "B-1", EventItemTitle: "An Ordinance", EventItemMatterId: 7 },
    ];
    expect(legistarItems(rows as never).map((i) => i.number)).toEqual(["A", "B-1"]);
  });
});

describe("public comment speakers", () => {
  it("never become items: Ann Arbor lists 30+ residents by name under PUBLIC COMMENTARY", async () => {
    const rows = JSON.parse(readFileSync("tests/fixtures/annarbor-legistar-eventitems-14160.json", "utf8"));
    const items = legistarItems(rows);
    expect(items.some((i) => /Brian Chambers|Kathy Griswold/.test(i.text))).toBe(false);
    expect(items.some((i) => /^\d+\.$/.test(i.number))).toBe(false);
    expect(items.some((i) => i.number === "CA-5")).toBe(true);
  });
});

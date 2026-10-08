// T059: meeting calendar (FR-017, US4).
import { describe, expect, it } from "vitest";
import { calendarOf } from "@/components/calendar/calendar-data";
import { NOT_STATED, type Meeting } from "@/lib/schemas";

const m = (date: string, over: Partial<Meeting> = {}): Meeting => ({
  meetingId: date,
  sourceId: "s",
  body: "Board of Commissioners",
  role: "county_executive",
  date,
  time: "6:00 PM",
  location: "Courthouse",
  agendaUrl: `https://x.gov/${date}.pdf`,
  documentHashes: ["d"],
  ...over,
});

describe("calendarOf", () => {
  it("splits upcoming and recent meetings, each in date order", () => {
    const c = calendarOf([m("2026-10-21"), m("2026-10-05"), m("2026-10-12"), m("2026-09-28")], "2026-10-08");
    expect(c.upcoming.map((x) => x.date)).toEqual(["2026-10-12", "2026-10-21"]);
    expect(c.recent.map((x) => x.date)).toEqual(["2026-10-05", "2026-09-28"]);
  });

  it("shows missing time or place as not stated in the record", () => {
    const c = calendarOf([m("2026-10-12", { time: null, location: null })], "2026-10-08");
    expect(c.upcoming[0]).toMatchObject({ time: NOT_STATED, location: NOT_STATED });
  });

  it("flags meetings whose agenda is not published yet", () => {
    const c = calendarOf([m("2026-10-21", { agendaPublished: false, documentHashes: [] })], "2026-10-08");
    expect(c.upcoming[0].agendaPublished).toBe(false);
  });

  it("counts a meeting today as upcoming", () => {
    expect(calendarOf([m("2026-10-08")], "2026-10-08").upcoming).toHaveLength(1);
  });
});

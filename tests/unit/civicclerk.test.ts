import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { civicclerkReader, civicclerkItems, stripHtml } from "@/pipeline/readers/civicclerk";
import { testContext } from "@/pipeline/context";
import type { Source } from "@/lib/schemas";

const events = readFileSync("tests/fixtures/columbia-civicclerk-events.json");
const meeting = readFileSync("tests/fixtures/columbia-civicclerk-meeting-3463.json");
const ok = (b: Buffer) => ({ status: 200, contentType: "application/json", bytes: new Uint8Array(b) });

const source: Source = {
  sourceId: "s",
  role: "county_executive",
  url: "https://columbiacoga.portal.civicclerk.com/",
  host: "columbiacoga.portal.civicclerk.com",
  platform: "civicclerk",
  platformKey: "columbiacoga",
  verification: { url: "", official: true, rightPlace: true, rightBody: true, confidence: 1, reason: "", bodyName: "Board of Commissioners" },
  accepted: true,
  checkedAt: "",
};

describe("CivicClerk reader on the real Columbia County, GA API responses", () => {
  const ctx = testContext({
    fetcher: async (url) => {
      if (/\/Meetings\/3463$/.test(url)) return ok(meeting);
      if (/\$skiptoken/.test(url)) return ok(Buffer.from('{"value":[]}')); // last page
      if (/\/Events\?/.test(url)) return ok(events);
      return { status: 404, contentType: "text/plain", bytes: new Uint8Array() };
    },
  });

  it("keeps Board of Commissioners meetings, not committees or authorities", async () => {
    const meetings = await civicclerkReader.list(ctx, source, { from: "2026-09-24", to: "2026-10-29" });
    expect(meetings.map((m) => `${m.date} ${m.bodyName}`)).toEqual(["2026-10-06 Board of Commissioners Meeting"]);
  });

  it("gives the meeting time, place and the agenda PDF as citation target", async () => {
    const [m] = await civicclerkReader.list(ctx, source, { from: "2026-09-24", to: "2026-10-29" });
    expect(m.time).toBe("6:00 PM");
    expect(m.location).toBeNull(); // the structured address is empty in the record
    expect(m.note).toContain("Evans Government Center Auditorium"); // the description says where
    expect(m.agendaUrl).toBe("https://columbiacoga.api.civicclerk.com/v1/Meetings/GetMeetingFileStream(fileId=13850,plainText=false)");
  });

  it("flattens the item tree into leaf items with full outline numbers", async () => {
    const [m] = await civicclerkReader.list(ctx, source, { from: "2026-09-24", to: "2026-10-29" });
    const byNumber = Object.fromEntries(m.items!.map((i) => [i.number, i]));
    expect(byNumber["H.2.c"].title).toMatch(/^Bid# 2026027-BID2710 and Contract #2026-3708 with Peek Pavement Marking/);
    expect(byNumber["H.2.c"].text).toContain("$378,736.34");
    expect(byNumber["H.2"]).toBeUndefined(); // section with children
    expect(byNumber["H"]).toBeUndefined();
  });
});

describe("civicclerk helpers", () => {
  it("strips HTML and decodes entities", () => {
    expect(stripHtml("<p>Location&nbsp;&ndash; Wrightsboro&nbsp;Rd &amp; Horizon</p>")).toBe("Location – Wrightsboro Rd & Horizon");
  });
  it("numbers nested items by their path", () => {
    const tree = [{ agendaObjectItemOutlineNumber: "A.", agendaObjectItemName: "CALL TO ORDER", childItems: [] }, { agendaObjectItemOutlineNumber: "B.", agendaObjectItemName: "CONSENT", childItems: [{ agendaObjectItemOutlineNumber: "1.", agendaObjectItemName: "Item one", childItems: [] }] }];
    expect(civicclerkItems(tree as never).map((i) => i.number)).toEqual(["A", "B.1"]);
  });
});

describe("public comment speakers (CivicClerk)", () => {
  it("drops names listed under PUBLIC COMMENTS", () => {
    const tree = JSON.parse(readFileSync("tests/fixtures/columbia-civicclerk-meeting-3463.json", "utf8")).items;
    const items = civicclerkItems(tree);
    expect(items.some((i) => /Lee Muns/.test(i.text))).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseListing, docKind, dateFrom, forRole, toMeetings } from "@/pipeline/readers/generic";
import { readDocument } from "@/pipeline/stages/read";
import { detectPlatform } from "@/pipeline/readers/index";
import { testContext } from "@/pipeline/context";

const listing = readFileSync("tests/fixtures/edgecombe-agendas-listing.md", "utf8");
const base = "https://www.edgecombecountync.gov/residents/agendas.php";

describe("parseListing on the real Edgecombe agendas page", () => {
  const docs = parseListing(listing, base);

  it("keeps both page-relative and root-relative candidates for relative links", () => {
    const oct5 = docs.find((d) => d.date === "2026-10-05" && d.kind === "agenda")!;
    expect(oct5.urls).toEqual([
      "https://www.edgecombecountync.gov/residents/Commissioners/Agendas/2026/00.%20Regular%20Board%20Meeting%20Agenda%20_October%205%202026_%20FINAL.pdf?t=202610050816210",
      "https://www.edgecombecountync.gov/Commissioners/Agendas/2026/00.%20Regular%20Board%20Meeting%20Agenda%20_October%205%202026_%20FINAL.pdf?t=202610050816210",
    ]);
  });

  it("uses a single candidate for absolute links", () => {
    const abs = parseListing("[October 5, 2026 Agenda](https://x.gov/a/Agenda_Oct_5_2026.pdf)", base);
    expect(abs[0].urls).toEqual(["https://x.gov/a/Agenda_Oct_5_2026.pdf"]);
  });

  it("reads meeting dates from link labels or file names", () => {
    const dates = new Set(docs.map((d) => d.date));
    for (const d of ["2026-10-05", "2026-09-08", "2026-06-22", "2026-05-04", "2026-01-05"]) expect(dates).toContain(d);
  });

  it("classifies agendas and packets", () => {
    expect(docs.some((d) => d.date === "2026-10-05" && d.kind === "packet")).toBe(true);
    expect(docKind("Agenda Packet", "x/0. Packet Cover_ October 5 2026.pdf")).toBe("packet");
    expect(docKind("Minutes", "x/minutes.pdf")).toBe("minutes");
    expect(docKind("October 5, 2026 Agenda", "x/Agenda.pdf")).toBe("agenda");
  });
});

describe("dateFrom", () => {
  it("parses the formats seen on real portals", () => {
    expect(dateFrom("May 4 ,2026")).toBe("2026-05-04");
    expect(dateFrom("Jan 5 2026 Agenda.pdf")).toBe("2026-01-05");
    expect(dateFrom("Agenda _June 22 2026_Special Meeting")).toBe("2026-06-22");
    expect(dateFrom("10/05/2026")).toBe("2026-10-05");
    expect(dateFrom("February 2025 Agenda")).toBeNull();
  });
});

describe("detectPlatform", () => {
  it("routes known portals to their reader and derives the tenant from the URL", () => {
    expect(detectPlatform("https://a2gov.legistar.com/Calendar.aspx")).toEqual({ platform: "legistar", key: "a2gov" });
    expect(detectPlatform("https://columbiacoga.portal.civicclerk.com/")).toEqual({ platform: "civicclerk", key: "columbiacoga" });
    expect(detectPlatform("https://go.boarddocs.com/sc/acs/Board.nsf/Public")).toEqual({ platform: "boarddocs", key: "sc/acs" });
    expect(detectPlatform(base)).toEqual({ platform: "generic", key: null });
  });
});

describe("readDocument", () => {
  const url = "https://www.edgecombecountync.gov/Commissioners/Agendas/2026/agenda.pdf";
  const agendaText = readFileSync("tests/fixtures/edgecombe-agenda-2026-10-05.md", "utf8");

  it("falls back to Tavily Extract when the site answers 403, with unknown page boundaries", async () => {
    const extracted: string[][] = [];
    const ctx = testContext({
      fetcher: async () => ({ status: 403, contentType: "text/html", bytes: new Uint8Array() }),
      tavily: {
        credits: 0,
        search: async () => [],
        map: async () => [],
        extract: async (urls) => {
          extracted.push(urls);
          return { results: [{ url: urls[0], raw_content: agendaText }], failed: [] };
        },
      },
    });
    const { doc, text } = await readDocument(ctx, { urls: [url], kind: "agenda", meetingId: "m1" });
    expect(doc.via).toBe("tavily_extract");
    expect(doc.pages).toBeNull();
    expect(doc.readable).toBe(true);
    expect(text).toContain("4.8. CONSIDERATION");
    expect(extracted).toEqual([[url]]);

    // second read hits the cache: no new network call
    await readDocument(ctx, { urls: [url], kind: "agenda", meetingId: "m1" });
    expect(extracted).toHaveLength(1);
  });

  it("reads a PDF directly page by page when the site allows it", async () => {
    const pdf = readFileSync("tests/fixtures/columbia-civicclerk-agenda-13850.pdf");
    const ctx = testContext({ fetcher: async () => ({ status: 200, contentType: "application/pdf", bytes: new Uint8Array(pdf) }) });
    const { doc, text } = await readDocument(ctx, { urls: ["https://x.gov/a.pdf"], kind: "agenda", meetingId: "m2" });
    expect(doc.via).toBe("direct");
    expect(doc.pages!.length).toBeGreaterThan(0);
    expect(doc.pages![0]).toMatchObject({ n: 1, start: 0 });
    expect(text.length).toBeGreaterThan(500);
  });
});

describe("CivicPlus AgendaCenter links", () => {
  it("reads the date from the file name and prefers the PDF over the HTML view", () => {
    const docs = parseListing("[Agenda](/AgendaCenter/ViewFile/Agenda/_09242026-569?html=true)", "https://co.caroline.va.us/AgendaCenter");
    expect(docs[0].date).toBe("2026-09-24");
    expect(docs[0].urls[0]).toBe("https://co.caroline.va.us/AgendaCenter/ViewFile/Agenda/_09242026-569");
  });
});

describe("month-only agenda links (Vernon Parish, LA)", () => {
  const listing = [
    "[Agenda](https://vernonparish.org/wp-content/uploads/2026/07/JULY-2026-AGENDA.pdf)",
    "[Minutes](https://vernonparish.org/wp-content/uploads/2026/07/JULY-21-2026-MINUTES.pdf)",
    "[Agenda](https://vernonparish.org/wp-content/uploads/2026/07/JUN-2026-AGENDA.pdf)",
  ].join("\n");

  it("keeps the month without inventing a day", () => {
    const docs = parseListing(listing, "https://vernonparish.org/about-us/agendas-minutes");
    expect(docs.find((d) => /JULY-2026-AGENDA/.test(d.urls[0]))).toMatchObject({ date: "", month: "2026-07", kind: "agenda" });
  });

  it("dates the agenda from the same month's minutes, and drops months it cannot date", async () => {
    const { genericReader } = await import("@/pipeline/readers/generic");
    const ctx = testContext({
      tavily: { credits: 0, search: async () => [], map: async () => [], extract: async (urls) => ({ results: [{ url: urls[0], raw_content: listing }], failed: [] }) },
      fetcher: async () => ({ status: 404, contentType: "text/html", bytes: new Uint8Array() }),
    });
    const src = { sourceId: "s", role: "county_executive", url: "https://vernonparish.org/about-us/agendas-minutes", host: "vernonparish.org", platform: "generic", platformKey: null, verification: { url: "", official: true, rightPlace: true, rightBody: true, confidence: 1, reason: "", bodyName: "Police Jury" }, accepted: true, checkedAt: "" } as const;
    const meetings = await genericReader.list(ctx, src as never, { from: "2026-09-24", to: "2026-10-29" });
    expect(meetings.map((m) => m.date)).toEqual(["2026-07-21"]);
    expect(meetings[0].docs.map((d) => d.kind).sort()).toEqual(["agenda", "minutes"]);
  });
});

describe("Agenda Center pages that list every board (Porter County, IN)", () => {
  const md = [
    "# Agenda Center",
    "## Commissioners",
    "| **Oct 6, 2026** — Posted Oct 2, 2026 [Board of Commissioners' Meeting](/AgendaCenter/ViewFile/Agenda/_10062026-2236) |",
    "## Plan Commission",
    "| **Oct 13, 2026** — Posted Oct 8, 2026 [Plan Commission Meeting](/AgendaCenter/ViewFile/Agenda/_10132026-2237) |",
    "## Election Board",
    "| **Sep 30, 2026** — Posted Sep 25, 2026 [Public Test of Election Equipment](/AgendaCenter/ViewFile/Agenda/_09302026-2232) |",
  ].join("\n");
  const docs = parseListing(md, "https://www.portercountyin.gov/agendacenter");

  it("records the heading each document sits under", () => {
    expect(docs.map((d) => d.section)).toEqual(["Commissioners", "Plan Commission", "Election Board"]);
  });

  it("keeps only the board looked for", () => {
    expect(forRole(docs, "county_executive").map((d) => d.date)).toEqual(["2026-10-06"]);
    expect(forRole(docs, "planning").map((d) => d.date)).toEqual(["2026-10-13"]);
  });

  it("names each meeting after its section when the page gives no board name", () => {
    const [m] = toMeetings(forRole(docs, "planning"), null, { from: "2026-09-25", to: "2026-10-30" }, "Planning Commission");
    expect(m.bodyName).toBe("Plan Commission");
  });

  it("leaves pages without board headings alone", () => {
    const years = parseListing("## 2026\n[Regular Meeting](/a/_10062026-1.pdf)\n## 2025\n[Regular Meeting](/a/_10072025-2.pdf)", "https://x.gov/agendas");
    expect(forRole(years, "planning")).toHaveLength(2);
  });
});

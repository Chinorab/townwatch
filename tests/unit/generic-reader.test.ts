import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseListing, docKind, dateFrom } from "@/pipeline/readers/generic";
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

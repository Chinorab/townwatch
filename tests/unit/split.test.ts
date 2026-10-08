import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { splitAgenda } from "@/pipeline/stages/split";

const edgecombe = readFileSync("tests/fixtures/edgecombe-agenda-2026-10-05.md", "utf8");
const meta = { meetingId: "m1", docHash: "d1", docUrl: "https://example.gov/agenda.pdf" };

describe("splitAgenda on the real Edgecombe 5 Oct 2026 agenda (single-line text)", () => {
  const items = splitAgenda(edgecombe, meta, null);
  const byNumber = Object.fromEntries(items.map((i) => [i.number, i]));

  it("keeps official numbers in order", () => {
    const numbers = items.map((i) => i.number);
    for (const n of ["1.1", "2", "3", "4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9"]) expect(numbers).toContain(n);
    expect(numbers.indexOf("4.1")).toBeLessThan(numbers.indexOf("4.8"));
  });

  it("does not split on numbers inside text (dates, phone numbers, case ids)", () => {
    expect(items.map((i) => i.number)).not.toContain("26");
    expect(items.map((i) => i.number)).not.toContain("2026");
    expect(byNumber["4.2"].text).toContain("26-PG01");
    expect(byNumber["4.2"].text).toContain("November 2, 2026");
  });

  it("copies titles verbatim from the record", () => {
    expect(byNumber["4.8"].title).toBe("CONSIDERATION to APPROVE resolution opposing sell of Rocky Mt’s Water System to private entity");
    expect(byNumber["4.8"].text.startsWith("4.8. CONSIDERATION")).toBe(true);
  });

  it("returns leaf items only: a section heading with children is not an item", () => {
    expect(byNumber["4"]).toBeUndefined();
    expect(byNumber["1"]).toBeUndefined();
  });

  it("gives each item a stable hash and the document link", () => {
    expect(byNumber["4.8"].itemHash).toMatch(/^[0-9a-f]{64}$/);
    expect(splitAgenda(edgecombe, meta, null).find((i) => i.number === "4.8")!.itemHash).toBe(byNumber["4.8"].itemHash);
    expect(byNumber["4.8"].docUrl).toBe(meta.docUrl);
  });

  it("maps items to pages when page boundaries are known", () => {
    const text = "1. FIRST ITEM text\n2. SECOND ITEM text\n3. THIRD ITEM text";
    const its = splitAgenda(text, meta, [{ n: 1, start: 0, end: 19 }, { n: 2, start: 19, end: text.length }]);
    expect(its.map((i) => i.page)).toEqual([1, 2, 2]);
  });
});

describe("splitAgenda on the real Edgecombe Board of Education 14 Sep 2026 agenda (parenthesised numbers, per-page text)", () => {
  const text = readFileSync("tests/fixtures/edgecombe-boe-agenda-2026-09-14.txt", "utf8");
  const pages = JSON.parse(readFileSync("tests/fixtures/edgecombe-boe-agenda-2026-09-14.pages.json", "utf8"));
  const items = splitAgenda(text, meta, pages);
  const byNumber = Object.fromEntries(items.map((i) => [i.number, i]));

  it("finds items with suffixed numbers and keeps them verbatim", () => {
    for (const n of ["1.1", "2", "6.3", "6.5", "8.1.A", "8.7.A", "8.1.1", "8.2.B"]) expect(byNumber[n], n).toBeDefined();
    expect(byNumber["6.3"].title).toBe("Local Budget Report");
  });

  it("splits markers written without a space after the parenthesis", () => {
    expect(byNumber["8.6.B"].title.startsWith("Approval of submitting the 2026-2027 Every Student Succeeds Act")).toBe(true);
    expect(byNumber["8.5.B"].text).not.toContain("8.6.B");
    expect(byNumber["8.11.B"]).toBeDefined();
  });

  it("drops section headings that have children", () => {
    expect(byNumber["6"]).toBeUndefined();
    expect(byNumber["8A"]).toBeUndefined();
    expect(byNumber["8.1.B"]).toBeUndefined();
  });

  it("assigns pages from the PDF page boundaries", () => {
    expect(byNumber["6.3"].page).toBe(1);
    expect(byNumber["8.2.B"].page).toBeGreaterThan(1);
  });

  it("does not take field-trip codes or times for item numbers", () => {
    expect(items.map((i) => i.number).join(" ")).not.toMatch(/36278|36949/);
  });
});

describe("splitAgenda on multi-line numbering styles", () => {
  it("splits lettered agendas", () => {
    const text = "A. CALL TO ORDER\nB. INVOCATION\nC. APPROVAL OF THE MINUTES\nD. NEW BUSINESS: rezoning request";
    expect(splitAgenda(text, meta, null).map((i) => i.number)).toEqual(["A", "B", "C", "D"]);
  });
});

describe("splitAgenda on a CivicPlus HTML agenda (number alone on its line, heading below)", () => {
  const text = "# CALL TO ORDER\n\n# PLEDGE OF ALLEGIANCE\n\n3.\n\n# APPROVAL OF MINUTES\n\n3.I.\n\n## Meeting Minutes\n\n**Documents:**\n\n4.\n\n# PUBLIC HEARINGS\n\n4.I.\n\n## SPEX-09-2026 – Sale, Russell & Kay, Owner/Applicant\n\nRequest a Special Exception Permit on Tax Parcel No. 8-A-87A.\n\n4.II.\n\n## RZ-01-2026 – Bauserman, Warren S. and Barbara, Owner/Applicant\n\nRequest a Rezoning.";
  const items = splitAgenda(text, meta, null);
  it("keeps roman sub-numbers and drops the section headings", () => {
    expect(items.map((i) => i.number)).toEqual(["3.I", "4.I", "4.II"]);
    expect(items[1].title).toBe("SPEX-09-2026 – Sale, Russell & Kay, Owner/Applicant");
  });
});

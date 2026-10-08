import { describe, expect, it } from "vitest";
import { ground } from "@/pipeline/stages/ground";
import { NOT_STATED, type AgendaItem, type ExplanationDraft } from "@/lib/schemas";

const item: AgendaItem = {
  itemHash: "h48",
  number: "4.8",
  title: "CONSIDERATION to APPROVE resolution opposing sell of Rocky Mt's Water System to private entity",
  text: "4.8. CONSIDERATION to APPROVE resolution opposing sell of Rocky Mt’s Water System to private entity - Attachment #7 (Recommended action: Approve resolution as presented)",
  meetingId: "m1",
  docHash: "doc1",
  docUrl: "https://www.edgecombecountync.gov/Commissioners/Agendas/2026/agenda.pdf",
  page: null,
};
const header = "EDGECOMBE COUNTY BOARD OF COMMISSIONERS 201 Saint Andrew Street, Tarboro, NC 27886 October 5, 2026 AGENDA";

function draft(over: Partial<ExplanationDraft> = {}): ExplanationDraft {
  return {
    headline: { text: "Commissioners vote on a resolution about the Rocky Mount water system", quote: "resolution opposing sell of Rocky Mt’s Water System" },
    statements: [
      { kind: "what", text: "The board will consider a resolution opposing the sale of the Rocky Mount water system to a private entity.", quote: "APPROVE resolution opposing sell of Rocky Mt’s Water System to private entity" },
      { kind: "when", text: "The item is on the agenda for October 5, 2026.", quote: "October 5, 2026 AGENDA" },
    ],
    fields: { meetingDate: "October 5, 2026", amount: null, place: "Rocky Mount", body: "Board of Commissioners", commentRules: null },
    ...over,
  };
}

describe("ground (principles I, II, III)", () => {
  it("keeps statements whose quote is in the item text or document header, with citations", () => {
    const e = ground(draft(), item, header, "m-ultra");
    expect(e.statements).toHaveLength(2);
    expect(e.headline?.citation).toMatchObject({ itemNumber: "4.8", docUrl: item.docUrl, page: null });
    expect(e.dropped.count).toBe(0);
  });

  it("matches quotes despite case, whitespace and curly quote differences", () => {
    const d = draft({ statements: [{ kind: "what", text: "A resolution about the water system.", quote: "approve  resolution opposing sell of rocky mt's water system" }] });
    expect(ground(d, item, header, "m").statements).toHaveLength(1);
  });

  it("accepts a quote that only omits a parenthetical, and nothing looser", () => {
    const money: AgendaItem = { ...item, text: "(8.5.B) Approval of the purchase of MORE, a supplemental program, in the amount of $13,850 (Thirteen Thousand Eight Hundred Fifty Dollars) using PRC 050 – Title I Federal Funds." };
    const ok = draft({ statements: [{ kind: "what", text: "The board may buy MORE for $13,850.", quote: "in the amount of $13,850 using PRC 050 – Title I Federal Funds" }] });
    expect(ground(ok, money, header, "m").statements).toHaveLength(1);
    const reworded = draft({ statements: [{ kind: "what", text: "The board may buy MORE for $13,850.", quote: "in the amount of $13,850 paid with Title I funds" }] });
    expect(ground(reworded, money, header, "m").statements).toHaveLength(0);
  });

  it("drops a statement whose quote is not in the source", () => {
    const d = draft({ statements: [{ kind: "change", text: "Water rates will rise.", quote: "rates will increase by 12 percent" }] });
    const e = ground(d, item, header, "m");
    expect(e.statements).toHaveLength(0);
    expect(e.dropped.reasons[0]).toMatch(/quote/);
  });

  it("drops a statement without a quote", () => {
    const d = draft({ statements: [{ kind: "what", text: "Something happens.", quote: null }] });
    expect(ground(d, item, header, "m").statements).toHaveLength(0);
  });

  it("drops a statement containing a number that is not in the source", () => {
    const d = draft({ statements: [{ kind: "change", text: "The sale is worth $4,000,000.", quote: "Rocky Mt’s Water System" }] });
    const e = ground(d, item, header, "m");
    expect(e.statements).toHaveLength(0);
    expect(e.dropped.reasons[0]).toMatch(/number/);
  });

  it("drops opinionated wording that is not in the source", () => {
    const d = draft({ statements: [{ kind: "change", text: "Residents should oppose this alarming sale.", quote: "Rocky Mt’s Water System" }] });
    const e = ground(d, item, header, "m");
    expect(e.statements).toHaveLength(0);
    expect(e.dropped.reasons[0]).toMatch(/neutral/);
  });

  it("replaces fields absent from the record with 'not stated in the record'", () => {
    const d = draft({ fields: { meetingDate: "October 12, 2026", amount: "$2 million", place: null, body: "City Council", commentRules: "" } });
    const e = ground(d, item, header, "m");
    expect(e.fields).toEqual({ meetingDate: NOT_STATED, amount: NOT_STATED, place: NOT_STATED, body: NOT_STATED, commentRules: NOT_STATED });
  });

  it("keeps fields present in the record", () => {
    const e = ground(draft(), item, header, "m");
    expect(e.fields.meetingDate).toBe("October 5, 2026");
    expect(e.fields.body).toBe("Board of Commissioners");
    expect(e.fields.amount).toBe(NOT_STATED);
  });

  it("accepts ISO dates for dates written in words in the record, and shows them in words", () => {
    const d = draft({ fields: { meetingDate: "2026-10-05", amount: null, place: null, body: null, commentRules: null } });
    expect(ground(d, item, header, "m").fields.meetingDate).toBe("October 5, 2026");
    const s = draft({ statements: [{ kind: "when", text: "The meeting is on 2026-10-05.", quote: "October 5, 2026 AGENDA" }] });
    expect(ground(s, item, header, "m").statements[0].text).toBe("The meeting is on October 5, 2026.");
  });

  it("records the page in citations when the item page is known", () => {
    const e = ground(draft(), { ...item, page: 2 }, header, "m");
    expect(e.statements[0].citation.page).toBe(2);
  });
});

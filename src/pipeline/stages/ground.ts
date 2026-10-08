// Grounding gate between Ultra and the reader (constitution I, II, III). Deterministic:
// a statement survives only if its quote is in the source, every number it states is in the
// source, and it adds no opinion word the source does not contain. Fields absent from the
// record become "not stated in the record". Nothing here asks a model.
import { NOT_STATED, type AgendaItem, type Explanation, type ExplanationDraft, type ExplanationFields, type Statement } from "@/lib/schemas";

const OPINION = [
  "should", "must oppose", "must support", "unfortunately", "fortunately", "thankfully", "sadly",
  "controversial", "alarming", "shocking", "outrageous", "egregious", "disastrous", "wasteful",
  "great news", "good news", "bad news", "we recommend", "it is important to", "beloved",
  "finally", "troubling", "welcome news", "crucial", "dangerous", "reckless",
];

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’‛′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function numbers(s: string): string[] {
  // "05" and "5" are the same number; "1,472" and "1472" too.
  return (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, "").replace(/\.$/, "").replace(/^0+(?=\d)/, ""));
}

/** Models often write dates as 2026-10-05 while records say October 5, 2026. */
function longDates(s: string): string {
  return s.replace(/\b(20\d\d)-(\d{2})-(\d{2})\b/g, (_, y, m, d) =>
    new Date(Date.UTC(+y, +m - 1, +d)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }),
  );
}

function words(s: string): string[] {
  return normalize(s).match(/[a-z']{4,}/g) ?? [];
}

interface Check {
  ok: boolean;
  reason?: string;
}

/** Agendas spell amounts out in parentheses ("$13,850 (Thirteen Thousand ...)") and models drop
 *  them when quoting. A quote still counts as verbatim if removing parentheticals is the only
 *  difference; nothing else is relaxed. */
function withoutParentheticals(s: string): string {
  return s.replace(/\s*\([^()]{1,120}\)/g, "").replace(/\s+/g, " ").trim();
}

function quoteFound(q: string, src: string): boolean {
  return src.includes(q) || withoutParentheticals(src).includes(withoutParentheticals(q));
}

function checkStatement(text: string, quote: string | null | undefined, src: string, srcNumbers: Set<string>): Check {
  const q = quote ? normalize(quote) : "";
  if (q.length < 8) return { ok: false, reason: "no quote" };
  if (!quoteFound(q, src)) return { ok: false, reason: "quote not found in source" };
  const missing = numbers(text).find((n) => !srcNumbers.has(n));
  if (missing) return { ok: false, reason: `number not in source: ${missing}` };
  const t = normalize(text);
  const opinion = OPINION.find((w) => new RegExp(`\\b${w}\\b`).test(t) && !new RegExp(`\\b${w}\\b`).test(src));
  if (opinion) return { ok: false, reason: `not neutral: "${opinion}"` };
  return { ok: true };
}

function checkField(raw: string | null | undefined, src: string, srcNumbers: Set<string>, srcWords: Set<string>): string {
  if (!raw || !raw.trim() || normalize(raw) === NOT_STATED) return NOT_STATED;
  const value = longDates(raw);
  if (numbers(value).some((n) => !srcNumbers.has(n))) return NOT_STATED;
  if (src.includes(normalize(value))) return value.trim();
  const w = words(value);
  return w.length > 0 && w.every((x) => srcWords.has(x)) ? value.trim() : NOT_STATED;
}

/**
 * @param header the first part of the source document (meeting body, date, place), which
 *   statements about "when" and "who" may legitimately quote.
 */
export function ground(draft: ExplanationDraft, item: AgendaItem, header: string, model: string): Explanation {
  const src = normalize(`${item.text}\n${header}`);
  const srcNumbers = new Set(numbers(src));
  const srcWords = new Set(words(src));
  const reasons: string[] = [];

  const cite = (quote: string) => ({ docUrl: item.docUrl, docHash: item.docHash, itemNumber: item.number, page: item.page, quote });

  const keep = (kind: Statement["kind"], raw: string, quote: string | null | undefined): Statement | null => {
    const text = longDates(raw);
    const c = checkStatement(text, quote, src, srcNumbers);
    if (!c.ok) {
      reasons.push(`${kind}: ${c.reason}`);
      return null;
    }
    return { kind, text: text.trim(), citation: cite(quote!.trim()) };
  };

  const headline = keep("headline", draft.headline.text, draft.headline.quote);
  const statements = draft.statements.map((s) => keep(s.kind, s.text, s.quote)).filter((s): s is Statement => s !== null);

  const f = draft.fields;
  const fields: ExplanationFields = {
    meetingDate: checkField(f.meetingDate, src, srcNumbers, srcWords),
    amount: checkField(f.amount, src, srcNumbers, srcWords),
    place: checkField(f.place, src, srcNumbers, srcWords),
    body: checkField(f.body, src, srcNumbers, srcWords),
    commentRules: checkField(f.commentRules, src, srcNumbers, srcWords),
  };

  return { itemHash: item.itemHash, headline, statements, fields, model, dropped: { count: reasons.length, reasons } };
}

// Splits agenda text into items that keep their official numbering, with no model involved
// (research R4). Works on single-line text (PDFs read through Tavily Extract lose line breaks):
// a number is accepted as an item marker only if it is a plausible successor of the previous
// marker, which rejects dates, phone numbers and case ids found inside item text.
import { sha256 } from "@/lib/store";
import type { AgendaItem } from "@/lib/schemas";

type Pages = { n: number; start: number; end: number }[] | null;
interface Meta {
  meetingId: string;
  docHash: string;
  docUrl: string;
}
interface Marker {
  index: number; // offset of the marker in the text
  label: string; // "4.8", "A"
  parts: number[];
}

const NUMERIC = /(?:^|\s)(\d{1,2}(?:\.\d{1,2})*)\.\s+(?=["“(]?[A-Z])/g;
const LETTER = /(?:^|\n)\s*([A-Z])\.\s+(?=[A-Z])/g;

function isSuccessor(prev: number[], next: number[]): boolean {
  if (prev.length === 0) return next.length >= 1 && next.every((p) => p === 1);
  // first child: 4 → 4.1
  if (next.length === prev.length + 1 && next.at(-1) === 1 && prev.every((p, i) => p === next[i])) return true;
  // sibling or ancestor sibling: 4.9 → 4.10, 4.12 → 5, 6.7 → 7
  for (let depth = prev.length; depth >= 1; depth--) {
    if (next.length !== depth) continue;
    const head = prev.slice(0, depth - 1);
    if (head.every((p, i) => p === next[i]) && next[depth - 1] === prev[depth - 1] + 1) return true;
  }
  return false;
}

function numericMarkers(text: string): Marker[] {
  const out: Marker[] = [];
  let prev: number[] = [];
  for (const m of text.matchAll(NUMERIC)) {
    const parts = m[1].split(".").map(Number);
    if (!isSuccessor(prev, parts)) continue;
    out.push({ index: m.index! + m[0].indexOf(m[1]), label: m[1], parts });
    prev = parts;
  }
  return out;
}

// "(6.3) Local Budget Report", "(8)A Consent Items", "(8.1.A) Field Trips" at the start of a
// line (school board agendas read with line breaks). Line start plus parentheses is specific
// enough without the successor check, which suffixed and skipped numbers would break.
const PAREN = /^[ \t]*\((\d{1,2}(?:\.\d{1,2})*)(\.[A-Z])?\)([A-Z](?=[ \t]))?[ \t]*(?=\S)/gm;

function parenMarkers(text: string): Marker[] {
  const out: Marker[] = [];
  for (const m of text.matchAll(PAREN)) {
    const label = m[1] + (m[2] ?? m[3] ?? "");
    out.push({ index: m.index! + m[0].indexOf("("), label, parts: m[1].split(".").map(Number) });
  }
  return out;
}

function letterMarkers(text: string): Marker[] {
  const out: Marker[] = [];
  let expected = 0;
  for (const m of text.matchAll(LETTER)) {
    const code = m[1].charCodeAt(0) - 65;
    if (code !== expected) continue;
    out.push({ index: m.index! + m[0].indexOf(m[1]), label: m[1], parts: [code + 1] });
    expected++;
  }
  return out;
}

const TITLE_END = /\s+[-–]\s+(?:Attachment|Amendment)\b|\s*\(Recommended|\s+•|\s+[A-Z]\.\s+(?=[A-Z])/;

/** Multi-line documents: the title is the first line, continued while a line does not end with
 *  ":" (a label introducing details, e.g. "Field Trips:") and stops at a blank line. */
function firstLines(body: string): string {
  const lines = body.split("\n");
  let out = "";
  for (const line of lines) {
    if (!line.trim()) break;
    out += (out ? " " : "") + line.trim();
    if (/:\s*$/.test(line) || out.length >= 220) break;
  }
  return out;
}

export function titleOf(body: string): string {
  const flat = body.includes("\n") ? firstLines(body) : body;
  const cut = flat.search(TITLE_END);
  const t = (cut > 0 ? flat.slice(0, cut) : flat).replace(/\s+/g, " ").trim().replace(/\s*[–-]$/, "");
  if (t.length <= 220) return t;
  const short = t.slice(0, 220);
  return short.slice(0, short.lastIndexOf(" ")) + " …";
}

export function splitAgenda(text: string, meta: Meta, pages: Pages): AgendaItem[] {
  // Use the numbering style that finds the most items; fewer than 3 means no reliable structure.
  const markers = [numericMarkers(text), parenMarkers(text), letterMarkers(text)].sort((a, b) => b.length - a.length)[0];
  if (markers.length < 3) return [];

  const items: AgendaItem[] = [];
  markers.forEach((mk, i) => {
    const next = markers[i + 1];
    const isParent = next !== undefined && next.parts.length > mk.parts.length && mk.parts.every((p, k) => p === next.parts[k]);
    if (isParent) return; // section heading: its children are the items
    const segment = text.slice(mk.index, next?.index ?? text.length).trim();
    // Strip the marker: "(8)A Consent", "(8.6.B)Approval" (no space), "4.8. CONSIDERATION", "A. CALL".
    const body = segment.replace(/^(?:\([^)]{1,12}\)[A-Z](?=\s)|\([^)]{1,12}\)|[^\s]+\.)\s*/, "");
    const page = pages?.find((p) => mk.index >= p.start && mk.index < p.end)?.n ?? null;
    items.push({
      itemHash: sha256(`${meta.docHash}|${mk.label}|${segment}`),
      number: mk.label,
      title: titleOf(body),
      text: segment,
      meetingId: meta.meetingId,
      docHash: meta.docHash,
      docUrl: meta.docUrl,
      page,
    });
  });
  return items;
}

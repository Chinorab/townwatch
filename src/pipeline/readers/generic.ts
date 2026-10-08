// Generic reader for municipal websites (CivicPlus, Revize, Edlio and similar): read the agenda
// listing page through Tavily Extract, find dated document links, and, when the page holds no
// documents, look one hop deeper with Tavily Map. No per-site rule anywhere.
import { cached, sha256 } from "@/lib/store";
import type { Source } from "@/lib/schemas";
import type { Ctx } from "../context";
import { inWindow, type ListedMeeting, type Reader, type Window } from "./types";
import { readDocument } from "../stages/read";

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
// Lookarounds instead of \b: file names glue words with "_" ("Agenda _June 22 2026_Special").
// File names also glue with dashes: "JULY-21-2026-MINUTES.pdf".
const MONTH_DATE = /(?<![a-z])(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[\s_-]+(\d{1,2})(?:st|nd|rd|th)?[\s_-]*,?[\s_-]*(20\d\d)(?!\d)/i;
const NUM_DATE = /\b(\d{1,2})[/-](\d{1,2})[/-](20\d\d)\b/;
const ISO_DATE = /\b(20\d\d)-(\d{2})-(\d{2})\b/;

function iso(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

// CivicPlus AgendaCenter encodes the meeting date in file names: /ViewFile/Agenda/_10052026-409
const CIVICPLUS_DATE = /_(\d{2})(\d{2})(20\d\d)-\d+/;

export function dateFrom(s: string): string | null {
  let m = s.match(MONTH_DATE);
  if (m) return iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  m = s.match(NUM_DATE);
  if (m) return iso(+m[3], +m[1], +m[2]);
  m = s.match(ISO_DATE);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(CIVICPLUS_DATE);
  if (m) return iso(+m[3], +m[1], +m[2]);
  return null;
}

const MONTH_YEAR = /(?<![a-z])(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s_.-]*(20\d\d)(?!\d)/i;

/** "JULY-2026-AGENDA.pdf" → "2026-07": a month without a day, never turned into a date by guess. */
export function monthFrom(s: string): string | null {
  const m = s.match(MONTH_YEAR);
  return m ? `${m[2]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, "0")}` : null;
}

export function docKind(label: string, href: string): "agenda" | "packet" | "minutes" {
  let file = href.split("?")[0].split("/").pop() ?? "";
  try {
    file = decodeURIComponent(file);
  } catch {
    // keep raw
  }
  const s = `${label} ${file}`;
  if (/packet/i.test(s)) return "packet";
  if (/minute/i.test(s)) return "minutes";
  return "agenda";
}

const LINK = /\[([^\]]{1,200})\]\(([^)\s][^)]*?)\)/g;
const DOCISH = /\.pdf|\.docx?\b|ViewFile|DocumentCenter|View\.ashx|AgendaCenter|agenda|minutes|packet/i;

export interface ListingDoc {
  /** YYYY-MM-DD, or "" when the link only gives a month (see `month`). */
  date: string;
  month?: string;
  kind: "agenda" | "packet" | "minutes";
  label: string;
  urls: string[];
}

function candidates(href: string, base: string): string[] {
  const h = href.trim();
  let urls: string[];
  if (/^https?:\/\//i.test(h)) urls = [new URL(h).toString()];
  else {
    const pageRelative = new URL(h, base).toString();
    const rootRelative = new URL(h.replace(/^\.?\//, ""), new URL(base).origin + "/").toString();
    urls = pageRelative === rootRelative ? [pageRelative] : [pageRelative, rootRelative];
  }
  // CivicPlus serves the same agenda as HTML (?html=true) and as a PDF: the PDF gives pages.
  return urls.flatMap((u) => (/\/AgendaCenter\/ViewFile\/.*[?&]html=true/i.test(u) ? [u.replace(/[?&]html=true/i, ""), u] : [u]));
}

export function parseListing(markdown: string, baseUrl: string): ListingDoc[] {
  const out: ListingDoc[] = [];
  const seen = new Set<string>();
  for (const m of markdown.matchAll(LINK)) {
    const [, label, href] = m;
    if (/^(mailto|tel|javascript):|^#/i.test(href) || /\.(png|jpe?g|gif|svg)(\?|$)/i.test(href)) continue;
    if (!DOCISH.test(`${label} ${href}`)) continue;
    const date = dateFrom(label) ?? dateFrom(decodeSafe(href));
    const month = date ? undefined : (monthFrom(label) ?? monthFrom(decodeSafe(href)) ?? undefined);
    if (!date && !month) continue;
    let urls: string[];
    try {
      urls = candidates(href, baseUrl);
    } catch {
      continue;
    }
    if (seen.has(urls[0])) continue;
    seen.add(urls[0]);
    out.push({ date: date ?? "", month, kind: docKind(label, href), label: label.trim(), urls });
  }
  return out;
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

async function extractPage(ctx: Ctx, url: string): Promise<string> {
  const day = ctx.now.toISOString().slice(0, 10);
  return cached(ctx.kv, `listing:${sha256(url)}:${day}`, async () => {
    const r = await ctx.tavily.extract([url]);
    return r.results[0]?.raw_content ?? "";
  }, 86_400);
}

export function toMeetings(docs: ListingDoc[], bodyName: string, window: Window): ListedMeeting[] {
  let picked = docs.filter((d) => inWindow(d.date, window));
  if (picked.length === 0) {
    // Nothing in the window: show the latest past meeting, dated, rather than nothing (spec edge
    // case). Small bodies meet monthly and post agendas a few days before.
    const latest = docs.map((d) => d.date).filter((d) => d < window.from).sort().at(-1);
    picked = latest ? docs.filter((d) => d.date === latest) : [];
  }
  const byDate = new Map<string, ListingDoc[]>();
  for (const d of picked) byDate.set(d.date, [...(byDate.get(d.date) ?? []), d]);
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, ds]) => {
      const agenda = ds.find((d) => d.kind === "agenda") ?? ds[0];
      return {
        date,
        time: null,
        location: null,
        bodyName,
        agendaUrl: agenda.urls.at(-1)!,
        docs: ds.map((d) => ({ urls: d.urls, kind: d.kind })),
      };
    });
}

/**
 * Documents linked by month only ("JULY-2026-AGENDA.pdf", Vernon Parish, LA) get the exact date
 * stated elsewhere in the record: another document of the same month ("JULY-21-2026-MINUTES")
 * or the agenda's own letterhead. Never a guessed day; unresolved documents are dropped.
 */
async function resolveMonths(ctx: Ctx, docs: ListingDoc[], window: Window): Promise<ListingDoc[]> {
  const dated = docs.filter((d) => d.date);
  const monthOnly = docs.filter((d) => !d.date && d.month);
  if (monthOnly.length === 0) return dated;
  const byMonth = new Map<string, string>();
  for (const d of [...dated].sort((a, b) => a.date.localeCompare(b.date))) byMonth.set(d.date.slice(0, 7), d.date);

  const months = [...new Set(monthOnly.map((d) => d.month!))].sort().reverse();
  const inWin = months.filter((m) => m >= window.from.slice(0, 7) && m <= window.to.slice(0, 7));
  const resolved: ListingDoc[] = [];
  for (const m of (inWin.length ? inWin : months.slice(0, 1)).slice(0, 2)) {
    const group = monthOnly.filter((d) => d.month === m);
    let date = byMonth.get(m);
    if (!date) {
      const agenda = group.find((d) => d.kind === "agenda") ?? group[0];
      const { doc, text } = await readDocument(ctx, { urls: agenda.urls, kind: agenda.kind, meetingId: "listing" });
      const found = doc.readable ? dateFrom(text.slice(0, 800)) : null;
      if (found?.startsWith(m)) date = found;
    }
    if (date) resolved.push(...group.map((d) => ({ ...d, date: date! })));
  }
  return [...dated, ...resolved];
}

export const genericReader: Reader = {
  async list(ctx, source: Source, window) {
    const bodyName = source.verification.bodyName ?? source.role;
    let docs = parseListing(await extractPage(ctx, source.url), source.url);

    if (docs.length === 0) {
      // One hop deeper: the found page links to the actual agendas page. Pages for the current
      // year first (Sussex County, VA keeps one agendas page per year).
      const host = new URL(source.url).host;
      const links = await cached(ctx.kv, `map:${sha256(source.url)}`, () =>
        ctx.tavily.map(source.url, { instructions: "pages that list meeting agendas and minutes", limit: 30 }),
      );
      const year = ctx.now.getUTCFullYear();
      const score = (u: string) => (u.includes(String(year)) ? 2 : u.includes(String(year - 1)) ? 1 : 0);
      const hops = links
        .filter((u) => u !== source.url && new URL(u).host === host && /agenda|minute|meeting/i.test(u))
        .sort((a, b) => score(b) - score(a))
        .slice(0, 2);
      for (const u of hops) docs = docs.concat(parseListing(await extractPage(ctx, u), u));
    }
    return toMeetings(await resolveMonths(ctx, docs, window), bodyName, window);
  },
};

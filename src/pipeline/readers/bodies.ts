// Recognises a governing body by its official name on a multi-body portal (Legistar and
// CivicClerk host every board of a place). Generic rules, never a per-city list.
import type { BodyRole } from "@/lib/schemas";

const ROLE: Record<BodyRole, RegExp> = {
  executive: /\b(city|town|village|borough)? ?council\b|board of (aldermen|selectmen|trustees)|city commission/i,
  county_executive: /board of (county )?commissioners|county commission|county council|board of supervisors|fiscal court|commissioners court|police jury|parish council|parish commission|quorum court/i,
  school_board: /board of education|school board|school committee|board of trustees.*school/i,
  planning: /planning|zoning|plan commission/i,
};

/** Sub-bodies that share words with the main ones ("Council Policy Agenda Committee"). */
const NOT_MAIN = /committee|subcommittee|caucus|work(ing)? ?session|study session|authority|advisory|retirement|retiree|pension|benefit plan|assessors|election|appeals|youth/i;

export function matchesRole(name: string, role: BodyRole): boolean {
  return ROLE[role].test(name) && !NOT_MAIN.test(name);
}

/** Sections that list residents who signed up to speak. Their names are not decisions and a
 *  briefing must not single out private individuals: such items are dropped by every reader. */
export const PUBLIC_COMMENT = /public comment|public commentary|citizen comment|public participation|audience participation|persons? wishing to address/i;

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/​/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function shortTitle(s: string): string {
  const one = s.replace(/\s+/g, " ").trim();
  if (one.length <= 220) return one;
  const cut = one.slice(0, 220);
  return cut.slice(0, cut.lastIndexOf(" ")) + " …";
}

export function clock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

import { NOT_STATED, type BodyRole, type Citation } from "@/lib/schemas";

export function longDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function shortDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Opens the official document; PDF viewers honour #page=N when the page is known. */
export function citeHref(c: Pick<Citation, "docUrl" | "page">): string {
  return c.page ? `${c.docUrl}#page=${c.page}` : c.docUrl;
}

export function citeLabel(c: Pick<Citation, "itemNumber" | "page">): string {
  return c.page ? `Item ${c.itemNumber}, page ${c.page}` : `Item ${c.itemNumber}`;
}

export const ROLE_LABEL: Record<BodyRole, string> = {
  executive: "Town council",
  county_executive: "County commission",
  school_board: "School board",
  planning: "Planning board",
};

export const isStated = (v: string) => v !== NOT_STATED;

export function headlineText(s: string): string {
  return s.trim().replace(/\.$/, "");
}

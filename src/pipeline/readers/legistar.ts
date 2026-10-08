// Legistar (Granicus) reader: the public Web API returns meetings and numbered agenda items,
// so nothing is scraped and no PDF has to be split. Client name = subdomain of *.legistar.com.
import type { Source } from "@/lib/schemas";
import type { Ctx } from "../context";
import { matchesRole, PUBLIC_COMMENT, shortTitle, stripHtml } from "./bodies";
import { getJson, lookbackFrom } from "./http";
import type { ListedMeeting, PlatformItem, Reader, Window } from "./types";

interface LegistarEvent {
  EventId: number;
  EventBodyName: string;
  EventDate: string;
  EventTime: string | null;
  EventLocation: string | null;
  EventAgendaFile: string | null;
  EventInSiteURL: string | null;
}

interface LegistarItem {
  EventItemAgendaSequence: number;
  EventItemAgendaNumber: string | null;
  EventItemTitle: string | null;
  EventItemAgendaNote?: string | null;
  EventItemMatterId: number | null;
  EventItemMatterName?: string | null;
}

const MAX_MEETINGS = 2;

export function legistarItems(rows: LegistarItem[]): PlatformItem[] {
  const sorted = [...rows].filter((r) => r.EventItemTitle?.trim()).sort((a, b) => a.EventItemAgendaSequence - b.EventItemAgendaSequence);
  const numbers = sorted.map((r) => r.EventItemAgendaNumber?.trim() ?? "");
  const seenMatters = new Set<number>();
  const out: PlatformItem[] = [];
  let section = "";
  sorted.forEach((r, i) => {
    const raw = numbers[i];
    // Unnumbered or letter-only rows in capitals are section headings ("PUBLIC COMMENTARY ...").
    if ((!raw || /^[A-Z]+$/.test(raw)) && !r.EventItemMatterId && /^[^a-z]+$/.test(r.EventItemTitle!.slice(0, 40))) section = r.EventItemTitle!;
    if (PUBLIC_COMMENT.test(section) && !r.EventItemMatterId) return; // speakers, not decisions
    const number = raw || String(r.EventItemAgendaSequence);
    // A header such as "PH" is followed by its own sub-items "PH-1", "PH-2".
    if (numbers.some((n, j) => j > i && (n.startsWith(`${number}-`) || n.startsWith(`${number}.`)))) return;
    if (r.EventItemMatterId) {
      if (seenMatters.has(r.EventItemMatterId)) return; // listed again under another heading
      seenMatters.add(r.EventItemMatterId);
    }
    const title = stripHtml(r.EventItemTitle!);
    const note = r.EventItemAgendaNote ? stripHtml(r.EventItemAgendaNote) : "";
    out.push({ number, title: shortTitle(title.split("\n")[0]), text: [`${number} ${title}`, note].filter(Boolean).join("\n") });
  });
  return out;
}

export const legistarReader: Reader = {
  async list(ctx: Ctx, source: Source, window: Window): Promise<ListedMeeting[]> {
    const client = source.platformKey;
    if (!client) return [];
    const api = `https://webapi.legistar.com/v1/${client}`;
    const filter = encodeURIComponent(`EventDate ge datetime'${lookbackFrom(window.from)}' and EventDate le datetime'${window.to}'`);
    const events = await getJson<LegistarEvent[]>(ctx, `${api}/events?$filter=${filter}&$orderby=EventDate`);

    const mine = events.filter((e) => matchesRole(e.EventBodyName, source.role)).map((e) => ({ e, date: e.EventDate.slice(0, 10) }));
    let picked = mine.filter((x) => x.date >= window.from && x.date <= window.to);
    if (picked.length === 0) picked = mine.filter((x) => x.date < window.from).slice(-1);

    const meetings: ListedMeeting[] = [];
    // Most recent first, only meetings whose agenda items are already published.
    for (const { e, date } of [...picked].reverse()) {
      if (meetings.length >= MAX_MEETINGS) break;
      const rows = await getJson<LegistarItem[]>(ctx, `${api}/events/${e.EventId}/eventitems?AgendaNote=1`);
      const items = legistarItems(rows);
      if (items.length === 0) continue;
      meetings.push({
        date,
        time: e.EventTime?.trim() || null,
        location: e.EventLocation?.trim() || null,
        bodyName: e.EventBodyName,
        agendaUrl: e.EventAgendaFile || e.EventInSiteURL || source.url,
        docs: [],
        items,
      });
    }
    return meetings.sort((a, b) => a.date.localeCompare(b.date));
  },
};

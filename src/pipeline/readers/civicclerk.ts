// CivicClerk reader: the public OData API behind *.portal.civicclerk.com returns meetings, the
// nested agenda item tree and the published PDFs. Tenant = subdomain of the portal.
import type { Source } from "@/lib/schemas";
import type { Ctx } from "../context";
import { clock, matchesRole, PUBLIC_COMMENT, shortTitle, stripHtml } from "./bodies";
import { getJson, lookbackFrom } from "./http";
import type { ListedMeeting, PlatformItem, Reader, Window } from "./types";

export { stripHtml };

interface CcEvent {
  id: number;
  eventName: string;
  eventDescription?: string | null;
  categoryName: string | null;
  startDateTime: string; // local wall time with a "Z" suffix (checked against event descriptions)
  agendaId: number;
  eventLocation: { address1?: string | null; city?: string | null; state?: string | null } | null;
  publishedFiles: { fileId: number; type: string }[] | null;
}

interface CcItem {
  agendaObjectItemOutlineNumber: string | null;
  agendaObjectItemName: string | null;
  agendaObjectItemDescription?: string | null;
  isSection?: number | boolean;
  childItems: CcItem[] | null;
}

const MAX_MEETINGS = 2;
const MAX_TEXT = 2_500;

export function civicclerkItems(tree: CcItem[], prefix: string[] = [], inPublicComment = false): PlatformItem[] {
  const out: PlatformItem[] = [];
  for (const node of tree) {
    const part = (node.agendaObjectItemOutlineNumber ?? "").replace(/\.$/, "").trim();
    const path = part ? [...prefix, part] : prefix;
    const kids = node.childItems ?? [];
    const publicComment = inPublicComment || PUBLIC_COMMENT.test(node.agendaObjectItemName ?? "");
    if (kids.length > 0) {
      out.push(...civicclerkItems(kids, path, publicComment));
      continue;
    }
    if (inPublicComment) continue; // a resident's name under "PUBLIC COMMENTS", not a decision
    const name = stripHtml(node.agendaObjectItemName ?? "");
    if (!name) continue;
    const description = stripHtml(node.agendaObjectItemDescription ?? "");
    const number = path.join(".");
    out.push({ number, title: shortTitle(name), text: `${number} ${name}${description ? `\n${description}` : ""}`.slice(0, MAX_TEXT) });
  }
  return out;
}

export const civicclerkReader: Reader = {
  async list(ctx: Ctx, source: Source, window: Window): Promise<ListedMeeting[]> {
    const tenant = source.platformKey;
    if (!tenant) return [];
    const api = `https://${tenant}.api.civicclerk.com/v1`;
    // The API pages at 15 events: follow @odata.nextLink. Busy counties publish dozens of meetings
    // a month (Washtenaw, MI), so read the window first and look further back only if needed.
    const fetchEvents = async (from: string, to: string, order: "asc" | "desc", maxPages: number) => {
      const filter = encodeURIComponent(`startDateTime ge ${from}T00:00:00Z and startDateTime le ${to}T23:59:59Z`);
      const out: CcEvent[] = [];
      let next: string | undefined = `${api}/Events?$filter=${filter}&$orderby=startDateTime ${order}`;
      for (let page = 0; next && page < maxPages; page++) {
        const res: { value: CcEvent[]; "@odata.nextLink"?: string } = await getJson(ctx, next);
        out.push(...res.value);
        next = res["@odata.nextLink"];
      }
      return [...new Map(out.map((e) => [e.id, e])).values()]
        .filter((e) => e.agendaId > 0 && matchesRole(`${e.eventName} ${e.categoryName ?? ""}`, source.role))
        .map((e) => ({ e, date: e.startDateTime.slice(0, 10) }))
        .sort((a, b) => a.date.localeCompare(b.date));
    };

    let picked = (await fetchEvents(window.from, window.to, "asc", 10)).filter((x) => x.date >= window.from && x.date <= window.to);
    if (picked.length === 0) {
      const before = await fetchEvents(lookbackFrom(window.from), window.from, "desc", 4);
      picked = before.filter((x) => x.date < window.from).slice(-1);
    }

    const meetings: ListedMeeting[] = [];
    // Most recent first, keeping only meetings whose agenda is already published: the next
    // meeting is often listed weeks before its agenda (Washtenaw, MI, 2026-10-08).
    for (const { e, date } of [...picked].reverse()) {
      if (meetings.length >= MAX_MEETINGS) break;
      const agendaFile = e.publishedFiles?.find((f) => f.type === "Agenda") ?? e.publishedFiles?.find((f) => /agenda/i.test(f.type));
      if (!agendaFile) continue; // agenda not published yet
      const meeting = await getJson<{ items: CcItem[] }>(ctx, `${api}/Meetings/${e.agendaId}`);
      const items = civicclerkItems(meeting.items ?? []);
      if (items.length === 0) continue;
      const loc = e.eventLocation;
      meetings.push({
        date,
        time: clock(e.startDateTime.slice(11, 16)),
        location: loc?.address1 ? [loc.address1, loc.city, loc.state].filter(Boolean).join(", ") : null,
        bodyName: e.eventName,
        note: e.eventDescription ? stripHtml(e.eventDescription) : undefined,
        agendaUrl: `${api}/Meetings/GetMeetingFileStream(fileId=${agendaFile.fileId},plainText=false)`,
        docs: [],
        items,
      });
    }
    return meetings.sort((a, b) => a.date.localeCompare(b.date));
  },
};

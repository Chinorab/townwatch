import type { Ctx } from "../context";
import type { DocumentRec, Source } from "@/lib/schemas";

export interface DocRef {
  /** Candidate URLs in order of preference; the first one that reads is cited. */
  urls: string[];
  kind: DocumentRec["kind"];
  meetingId: string;
}

/** Items already split by a platform API (Legistar, CivicClerk). */
export interface PlatformItem {
  number: string;
  title: string;
  text: string;
}

export interface ListedMeeting {
  date: string; // YYYY-MM-DD
  time: string | null;
  location: string | null;
  bodyName: string;
  agendaUrl: string;
  docs: Omit<DocRef, "meetingId">[];
  /** Present when the platform returns numbered items: no document splitting needed. */
  items?: PlatformItem[];
}

export interface Window {
  from: string; // YYYY-MM-DD inclusive
  to: string;
}

export interface Reader {
  list(ctx: Ctx, source: Source, window: Window): Promise<ListedMeeting[]>;
}

export function windowFor(now: Date, back = 14, ahead = 21): Window {
  const day = 86_400_000;
  return {
    from: new Date(now.getTime() - back * day).toISOString().slice(0, 10),
    to: new Date(now.getTime() + ahead * day).toISOString().slice(0, 10),
  };
}

export const inWindow = (date: string, w: Window) => date >= w.from && date <= w.to;

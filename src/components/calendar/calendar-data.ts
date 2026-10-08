import { NOT_STATED, type Meeting } from "@/lib/schemas";

export interface CalendarEntry {
  meetingId: string;
  date: string;
  body: string;
  time: string;
  location: string;
  agendaUrl: string;
  agendaPublished: boolean;
}

const entry = (m: Meeting): CalendarEntry => ({
  meetingId: m.meetingId,
  date: m.date,
  body: m.body,
  time: m.time ?? NOT_STATED,
  location: m.location ?? NOT_STATED,
  agendaUrl: m.agendaUrl,
  agendaPublished: m.agendaPublished !== false,
});

/** Upcoming meetings (today included) soonest first; recent ones latest first. */
export function calendarOf(meetings: Meeting[], today: string): { upcoming: CalendarEntry[]; recent: CalendarEntry[] } {
  const sorted = [...meetings].sort((a, b) => a.date.localeCompare(b.date));
  return {
    upcoming: sorted.filter((m) => m.date >= today).map(entry),
    recent: sorted.filter((m) => m.date < today).reverse().map(entry),
  };
}

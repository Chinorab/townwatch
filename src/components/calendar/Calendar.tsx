// Meeting calendar (FR-017, US4): when and where to attend, from the record. Missing times or
// places read "not stated in the record"; a scheduled meeting without agenda says so.
import { CalendarBlank } from "@phosphor-icons/react/dist/ssr";
import { NOT_STATED, type Meeting } from "@/lib/schemas";
import { calendarOf, type CalendarEntry } from "./calendar-data";
import styles from "./calendar.module.css";

function day(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
    date: d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" }),
  };
}

function Entry({ e }: { e: CalendarEntry }) {
  const d = day(e.date);
  return (
    <li className={styles.entry}>
      <p className={styles.when}>
        <span className={styles.weekday}>{d.weekday}</span>
        <span className={styles.date}>{d.date}</span>
      </p>
      <div>
        <p className={styles.body}>{e.body}</p>
        <p className={styles.meta}>
          <span className={e.time === NOT_STATED ? styles.notStated : undefined}>{e.time}</span>
          <span className={e.location === NOT_STATED ? styles.notStated : undefined}>{e.location}</span>
        </p>
        <p className={styles.link}>
          {e.agendaPublished ? <a href={e.agendaUrl}>Official agenda</a> : <span className={styles.notStated}>Agenda not published yet</span>}
        </p>
      </div>
    </li>
  );
}

export function Calendar({ meetings, today }: { meetings: Meeting[]; today: string }) {
  const { upcoming, recent } = calendarOf(meetings, today);
  return (
    <section className={styles.calendar} aria-labelledby="calendar-title">
      <h2 id="calendar-title" className={styles.title}>
        <CalendarBlank aria-hidden size={28} />
        Meetings
      </h2>
      <div className={styles.columns}>
        <div>
          <h3 className={styles.sub}>Coming up</h3>
          {upcoming.length ? (
            <ol className={styles.list}>
              {upcoming.map((e) => (
                <Entry key={e.meetingId} e={e} />
              ))}
            </ol>
          ) : (
            <p className={styles.none}>No upcoming meeting is listed online yet.</p>
          )}
        </div>
        <div>
          <h3 className={styles.sub}>Recently</h3>
          {recent.length ? (
            <ol className={styles.list}>
              {recent.map((e) => (
                <Entry key={e.meetingId} e={e} />
              ))}
            </ol>
          ) : (
            <p className={styles.none}>No recent meeting in this briefing.</p>
          )}
        </div>
      </div>
    </section>
  );
}

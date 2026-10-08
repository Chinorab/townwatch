import type { Briefing } from "@/lib/schemas";
import { citeHref, longDate } from "./format";
import styles from "./briefing.module.css";

/** Items not explained: official number and title copied from the record, nothing generated
 *  (FR-015a). Grouped by meeting, collapsed behind a disclosure because lists run long. */
export function AlsoOnAgenda({ b }: { b: Briefing }) {
  const byMeeting = b.meetings
    .map((m) => ({ m, items: b.alsoOnAgenda.filter((a) => a.meetingId === m.meetingId) }))
    .filter((g) => g.items.length > 0);
  if (byMeeting.length === 0) return null;

  return (
    <section className={styles.also} aria-labelledby="also-title">
      <h2 id="also-title" className={styles.sectionTitle}>
        Also on the agenda
      </h2>
      <p className={styles.sectionDek}>Every other item, as written in the official agenda.</p>
      {byMeeting.map(({ m, items }) => (
        <details key={m.meetingId} className={styles.meetingList}>
          <summary>
            <span className={styles.summaryBody}>{m.body}</span>
            <span className={styles.summaryMeta}>
              {longDate(m.date)}, {items.length} items
            </span>
          </summary>
          <ol className={styles.itemList}>
            {items.map((a) => (
              <li key={`${a.number}-${a.title}`}>
                <span className={`${styles.itemNumber} num`}>{a.number}</span>
                <a href={citeHref(a)}>{a.title}</a>
              </li>
            ))}
          </ol>
        </details>
      ))}
    </section>
  );
}

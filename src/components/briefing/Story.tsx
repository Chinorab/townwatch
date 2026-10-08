import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr";
import { NOT_STATED, type HeadlineItem } from "@/lib/schemas";
import { citeHref, citeLabel, headlineText, isStated, longDate } from "./format";
import styles from "./briefing.module.css";

/** Statement kinds shown as prose. "who" and "when" come from the meeting record and are shown
 *  once in the kicker and the facts row instead of being repeated in every story. */
const PROSE = new Set(["what", "change", "participate"]);

export function Story({ h, lead = false, windowFrom }: { h: HeadlineItem; lead?: boolean; windowFrom: string }) {
  const { item, meeting, explanation: e } = h;
  const prose = e.statements.filter((s) => PROSE.has(s.kind));
  const shown = prose.length > 0 ? prose : e.statements;
  const past = meeting.date < windowFrom;
  const Heading = lead ? "h2" : "h3";

  return (
    <article className={lead ? styles.lead : styles.story} aria-labelledby={`h-${item.itemHash.slice(0, 12)}`}>
      <p className={styles.kicker}>
        {meeting.body}
        <span className={styles.kickerDate}>
          {past ? `Latest agenda online, ${longDate(meeting.date)}` : longDate(meeting.date)}
        </span>
      </p>
      <Heading id={`h-${item.itemHash.slice(0, 12)}`} className={lead ? styles.leadHeadline : styles.headline}>
        {headlineText(e.headline?.text ?? item.title)}
      </Heading>

      <div className={styles.body}>
        {shown.map((s, i) => (
          <p key={i}>
            {s.text}{" "}
            <a className={styles.cite} href={citeHref(s.citation)} title={`Source: “${s.citation.quote}”`}>
              {citeLabel(s.citation)}
            </a>
          </p>
        ))}
      </div>

      <dl className={styles.facts}>
        <div>
          <dt>Decided by</dt>
          <dd>{meeting.body}</dd>
        </div>
        <div>
          <dt>Amount</dt>
          <dd className={isStated(e.fields.amount) ? undefined : styles.notStated}>{e.fields.amount}</dd>
        </div>
        <div>
          <dt>Meeting</dt>
          <dd>
            {longDate(meeting.date)}
            {meeting.time ? `, ${meeting.time}` : <span className={styles.notStated}>, time {NOT_STATED}</span>}
          </dd>
        </div>
        <div>
          <dt>Where</dt>
          <dd className={meeting.location ? undefined : styles.notStated}>{meeting.location ?? NOT_STATED}</dd>
        </div>
        <div>
          <dt>Comment</dt>
          <dd className={isStated(e.fields.commentRules) ? undefined : styles.notStated}>{e.fields.commentRules}</dd>
        </div>
      </dl>

      <p className={styles.record}>
        <a href={citeHref({ docUrl: item.docUrl, page: item.page })}>
          Read item {item.number} in the official agenda
          <ArrowSquareOut aria-hidden size={16} weight="regular" className={styles.icon} />
        </a>
      </p>
    </article>
  );
}

// Topic filter (FR-002, US3 scenario 4): plain links (?topic=...), rendered on the server, so it
// works without JavaScript and a filtered briefing can be shared. Unselected topics stay one
// click away.
import Link from "next/link";
import type { Topic } from "@/lib/schemas";
import styles from "./briefing.module.css";

export const TOPIC_LABEL: Record<Topic, string> = {
  schools: "Schools",
  taxes: "Taxes",
  zoning_land_use: "Zoning and land",
  roads_transport: "Roads and transport",
  water_utilities: "Water and utilities",
  public_safety: "Public safety",
  budget_spending: "Budget and spending",
  other: "Other",
};

export function TopicFilter({ placeId, counts, active }: { placeId: string; counts: Partial<Record<Topic, number>>; active: Topic | null }) {
  const topics = (Object.keys(TOPIC_LABEL) as Topic[]).filter((t) => counts[t]);
  if (topics.length < 2) return null;
  return (
    <nav className={styles.topics} aria-label="Filter by topic">
      <Link href={`/${placeId}#stories`} aria-current={active === null ? "page" : undefined} className={styles.topic}>
        All topics
      </Link>
      {topics.map((t) => (
        <Link key={t} href={`/${placeId}?topic=${t}#stories`} aria-current={active === t ? "page" : undefined} className={styles.topic}>
          {TOPIC_LABEL[t]} <span className="num">{counts[t]}</span>
        </Link>
      ))}
    </nav>
  );
}

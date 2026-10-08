import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { DEMO_PLACES } from "@/lib/briefings";
import { PlaceSearch } from "@/components/search/PlaceSearch";
import styles from "./home.module.css";

export default function Home() {
  return (
    <div className="wrap">
      <section className={styles.hero}>
        <h1 className={styles.title}>Know what your local government is deciding.</h1>
        <p className={styles.sub}>
          Townwatch reads the official agendas of your county, town and school board, and explains each decision in plain English.
        </p>
        <PlaceSearch />
      </section>

      <section className={styles.why} aria-labelledby="why-title">
        <h2 id="why-title" className={styles.whyTitle}>
          In 213 US counties, no local news source is left.
        </h2>
        <p className={styles.whyBody}>
          In 1,524 more, only one remains. That is about 50 million people with little or no local news, according to the{" "}
          <a href="https://localnewsinitiative.northwestern.edu/projects/state-of-local-news/2025/">State of Local News 2025</a> report by
          Northwestern University&rsquo;s Medill school. Nobody reads the agenda anymore, so decisions on taxes, water, roads and schools pass
          without residents knowing.
        </p>
      </section>

      <section id="places" className={styles.places} aria-labelledby="places-title">
        <h2 id="places-title" className={styles.placesTitle}>
          Places
        </h2>
        <ul className={styles.placeList}>
          {DEMO_PLACES.map((p) => (
            <li key={p.placeId}>
              <Link href={`/${p.placeId}`} className={styles.placeLink}>
                <span className={styles.placeName}>{p.name}</span>
                <span className={styles.placeState}>{p.state}</span>
                <span className={styles.placeNote}>{p.note}</span>
                <ArrowRight aria-hidden size={22} weight="regular" className={styles.placeArrow} />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.method} aria-labelledby="method-title">
        <h2 id="method-title" className={styles.methodTitle}>
          How a briefing is made
        </h2>
        <div className={styles.methodGrid}>
          <p>
            <strong>Official sources only.</strong> Townwatch finds the agenda pages of each governing body on its own and checks that each one is
            official, belongs to the right place and to the right board.
          </p>
          <p>
            <strong>Every item is read.</strong> Each agenda item is sorted, and only decisions that matter to residents get a full explanation.
            The rest is listed exactly as written.
          </p>
          <p>
            <strong>Every line is sourced.</strong> Each sentence links to the agenda item it comes from. A date or amount missing from the record
            reads &ldquo;not stated in the record&rdquo;.
          </p>
        </div>
      </section>
    </div>
  );
}

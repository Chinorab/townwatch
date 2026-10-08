import type { Metadata } from "next";
import styles from "./privacy.module.css";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <article className={`wrap ${styles.page}`}>
      <h1 className={styles.title}>Privacy</h1>
      <p className={styles.lead}>Townwatch has no accounts and keeps nothing about you.</p>

      <h2>What Townwatch stores</h2>
      <p>
        Only public records and the summaries made from them: official agendas, the place names people look up, and the cost of each analysis.
        None of it is linked to a person.
      </p>

      <h2>What Townwatch does not store</h2>
      <p>No name, no email, no account, no address, no history of what you read. There are no advertising or tracking cookies.</p>

      <h2>Your address</h2>
      <p>
        &ldquo;Near you&rdquo; can use your street address. Your browser sends it directly to the{" "}
        <a href="https://geocoding.geo.census.gov/geocoder/">US Census Bureau geocoder</a>, a free public service, which returns a map position.
        Townwatch&rsquo;s servers never receive the address or the position. Distances are computed in your browser and forgotten when you leave
        the page.
      </p>
      <p>
        If you prefer, drop a pin on a map instead: no address is used at all. The map images come from{" "}
        <a href="https://openfreemap.org">OpenFreeMap</a>, which sees which area of the map is displayed, like any map service.
      </p>

      <h2>Places named in agendas</h2>
      <p>
        To place agenda items on the map, Townwatch looks up the roads and sites named in the public record with{" "}
        <a href="https://nominatim.openstreetmap.org">OpenStreetMap Nominatim</a>. These lookups contain public record text only, never anything
        about you.
      </p>

      <h2>Limits on new places</h2>
      <p>
        To keep the service free, each visitor can start one new place per day. To count this without knowing who you are, Townwatch keeps a
        scrambled code made from your network address and a random value that changes every day. The code cannot be turned back into the address
        and is deleted after 24 hours.
      </p>

      <h2>Hosting</h2>
      <p>
        The site is hosted by Vercel, which keeps standard technical logs (such as IP addresses) for a short time to run and protect the service.
        Townwatch does not read or keep them.
      </p>

      <h2>Sources</h2>
      <p>
        Briefings are made only from documents published by governments, school districts and their official agenda platforms. The official
        record always prevails over the summary.
      </p>
    </article>
  );
}

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
        If a feature asks for your address, it stays in your browser. Townwatch&rsquo;s servers never receive it. This page will say exactly which
        public service turns it into a map position before that feature goes live.
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

import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Info } from "@phosphor-icons/react/dist/ssr";
import { getBriefing } from "@/lib/briefings";
import { STATE_NAMES } from "@/lib/places";
import { Story } from "@/components/briefing/Story";
import { AlsoOnAgenda } from "@/components/briefing/AlsoOnAgenda";
import { longDate, ROLE_LABEL } from "@/components/briefing/format";
import styles from "@/components/briefing/briefing.module.css";

export async function generateMetadata(props: PageProps<"/[placeId]">): Promise<Metadata> {
  const b = await getBriefing((await props.params).placeId);
  return { title: b ? `This week in ${b.placeName}` : "Place not found" };
}

export default function PlacePage(props: PageProps<"/[placeId]">) {
  return (
    <Suspense fallback={<BriefingSkeleton />}>
      <BriefingView params={props.params} />
    </Suspense>
  );
}

function BriefingSkeleton() {
  return (
    <div className="wrap" aria-busy="true" aria-label="Loading the briefing">
      <div className={styles.masthead}>
        <div className={styles.skelLine} style={{ width: "30%" }} />
        <div className={styles.skelTitle} />
        <div className={styles.skelLine} style={{ width: "60%" }} />
      </div>
    </div>
  );
}

async function BriefingView({ params }: { params: Promise<{ placeId: string }> }) {
  const { placeId } = await params;
  const b = await getBriefing(placeId);
  if (!b) notFound();

  const [lead, ...rest] = b.headlineItems;
  const covered = b.bodies.filter((x) => x.coverage === "covered");
  const missing = b.bodies.filter((x) => x.coverage !== "covered");

  return (
    <div className="wrap">
      <header className={styles.masthead}>
        <p className={styles.dateline}>
          {b.placeName}, {STATE_NAMES[b.state] ?? b.state}
          <span className="num">Updated {longDate(b.generatedAt)}</span>
        </p>
        <h1 className={styles.title}>This week in {b.placeName}</h1>
        <p className={styles.dek}>
          What {covered.map((c) => `the ${c.name.replace(new RegExp(`^${b.placeName}\\s+`, "i"), "")}`).join(" and ") || "local bodies"}{" "}
          {covered.length > 1 ? "are" : "is"} deciding, explained from their official agendas.
        </p>
        <p className={styles.notice}>
          <Info aria-hidden size={20} weight="regular" className={styles.icon} />
          Automatic summary. The official record prevails: each line links to the agenda item it comes from.
        </p>
      </header>

      {lead ? (
        <div className={styles.front}>
          <Story h={lead} lead windowFrom={b.window.from} />
          {rest.length > 0 && (
            <div className={styles.columns}>
              {rest.map((h) => (
                <Story key={h.item.itemHash} h={h} windowFrom={b.window.from} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className={styles.empty}>No decision needing explanation was found on the agendas currently online. Every item is listed below as written.</p>
      )}

      <AlsoOnAgenda b={b} />

      <section className={styles.coverage} aria-labelledby="coverage-title">
        <h2 id="coverage-title" className={styles.sectionTitle}>
          Where this comes from
        </h2>
        <ul className={styles.coverageList}>
          {covered.map((c) => (
            <li key={c.role}>
              <strong>{c.name}</strong>
              {c.portalUrl && (
                <a href={c.portalUrl} className={styles.portal}>
                  Official agenda page
                </a>
              )}
            </li>
          ))}
          {missing.map((c) => (
            <li key={c.role}>
              <strong>{ROLE_LABEL[c.role]}</strong>
              <span className={styles.notStated}>{c.coverage === "unreadable" ? "Agendas published on a portal Townwatch cannot read yet." : "No agenda found online."}</span>
              {c.coverage === "unreadable" && c.portalUrl && (
                <a href={c.portalUrl} className={styles.portal}>
                  Open the portal
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

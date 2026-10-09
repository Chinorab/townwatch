import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Info } from "@phosphor-icons/react/dist/ssr";
import { getBriefing } from "@/lib/briefings";
import { STATE_NAMES } from "@/lib/places";
import { lookupPlace } from "@/lib/place-index";
import { StartAnalysis } from "@/components/progress/StartAnalysis";
import { Story } from "@/components/briefing/Story";
import { AlsoOnAgenda } from "@/components/briefing/AlsoOnAgenda";
import { longDate, ROLE_LABEL } from "@/components/briefing/format";
import styles from "@/components/briefing/briefing.module.css";
import { TopicFilter } from "@/components/briefing/TopicFilter";
import { Calendar } from "@/components/calendar/Calendar";
import { HowThisWasMade } from "@/components/panel/HowThisWasMade";
import { NearYou, type LocatedItem } from "@/components/near/NearYou";
import { citeHref } from "@/components/briefing/format";
import { TOPICS, type Briefing, type Topic } from "@/lib/schemas";

export async function generateMetadata(props: PageProps<"/[placeId]">): Promise<Metadata> {
  const b = await getBriefing((await props.params).placeId);
  const name = b?.placeName ?? lookupPlace((await props.params).placeId)?.name;
  return { title: name ? `This week in ${name}` : "Place not found" };
}

export default function PlacePage(props: PageProps<"/[placeId]">) {
  return (
    <Suspense fallback={<BriefingSkeleton />}>
      <BriefingView params={props.params} searchParams={props.searchParams} />
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

async function BriefingView({ params, searchParams }: { params: Promise<{ placeId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { placeId } = await params;
  const raw = (await searchParams).topic;
  const topic = typeof raw === "string" && (TOPICS as readonly string[]).includes(raw) ? (raw as Topic) : null;
  const b = await getBriefing(placeId);
  if (!b) {
    const p = lookupPlace(placeId);
    if (!p) notFound();
    return (
      <div className="wrap">
        <header className={styles.masthead}>
          <p className={styles.dateline}>{p.name}, {STATE_NAMES[p.state]}</p>
          <h1 className={styles.title}>This week in {p.name}</h1>
        </header>
        <StartAnalysis placeId={p.placeId} placeName={p.name} stateName={STATE_NAMES[p.state]} />
      </div>
    );
  }

  const counts: Partial<Record<Topic, number>> = {};
  for (const t of [...b.headlineItems.map((h) => h.item.triage?.topic), ...b.alsoOnAgenda.map((a) => a.topic)]) if (t) counts[t] = (counts[t] ?? 0) + 1;
  const shown: Briefing = topic
    ? { ...b, headlineItems: b.headlineItems.filter((h) => h.item.triage?.topic === topic), alsoOnAgenda: b.alsoOnAgenda.filter((a) => a.topic === topic) }
    : b;
  const [lead, ...rest] = shown.headlineItems;
  const centre = lookupPlace(b.placeId);
  await connection(); // the calendar depends on today's date: render per request
  const today = new Date().toISOString().slice(0, 10);
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
          {covered.length === 0
            ? "No official agenda for this place could be read online yet."
            : <>
                What {new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(covered.map((c) => `the ${c.name.replace(new RegExp(`^${b.placeName}\\s+`, "i"), "")}`))}{" "}
                {covered.length > 1 ? "are deciding, explained from their official agendas." : "is deciding, explained from its official agendas."}
              </>}
        </p>
        <p className={styles.notice}>
          <Info aria-hidden size={20} weight="regular" className={styles.icon} />
          Automatic summary. The official record prevails: each line links to the agenda item it comes from.
        </p>
      </header>

      <div id="stories" />
      <TopicFilter placeId={b.placeId} counts={counts} active={topic} />
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
        <p className={styles.empty}>
          {b.headlineItems.length === 0 && b.alsoOnAgenda.length === 0 && !topic
            ? "There is nothing to summarise yet. The pages searched, and why each one was set aside, are listed under How this was made."
            : topic
            ? "No explained decision on this topic. Items on this topic, if any, are listed below as written."
            : "No decision needing explanation was found on the agendas currently online. Every item is listed below as written."}
        </p>
      )}

      <AlsoOnAgenda b={shown} />

      <Calendar meetings={b.meetings} today={today} />

      {centre && <NearYou placeName={b.placeName} stateCode={b.state} centre={{ lat: centre.lat, lon: centre.lon }} located={locatedItems(b)} />}

      <HowThisWasMade b={b} />

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

/** Joins located places with the items that mention them, for the client-side Near you list. */
function locatedItems(b: Briefing): LocatedItem[] {
  const meetings = new Map(b.meetings.map((m) => [m.meetingId, m]));
  const info = new Map<string, Omit<LocatedItem, "id" | "lat" | "lon" | "placeText">>();
  for (const h of b.headlineItems) {
    info.set(h.item.itemHash, {
      number: h.item.number,
      title: h.explanation.headline?.text ?? h.item.title,
      meetingBody: h.meeting.body,
      meetingDate: h.meeting.date,
      href: citeHref({ docUrl: h.item.docUrl, page: h.item.page }),
    });
  }
  for (const a of b.alsoOnAgenda) {
    const m = meetings.get(a.meetingId);
    if (a.itemHash && m) info.set(a.itemHash, { number: a.number, title: a.title, meetingBody: m.body, meetingDate: m.date, href: citeHref(a) });
  }
  return b.locatedItems.flatMap((l) => {
    const i = info.get(l.itemHash);
    return i ? [{ id: l.itemHash, lat: l.lat, lon: l.lon, placeText: l.placeText, ...i }] : [];
  });
}

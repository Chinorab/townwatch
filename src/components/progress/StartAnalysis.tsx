"use client";
// A place nobody has read yet (US2): start the analysis, then drive it step by step and show
// each stage as it happens. The page refreshes into the briefing when it is ready.
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, CircleNotch, Circle, WarningCircle } from "@phosphor-icons/react";
import styles from "./progress.module.css";

type Status = "queued" | "discovering" | "reading" | "triaging" | "explaining" | "assembling" | "done" | "failed";
interface Progress {
  sourcesFound: number;
  docsRead: number;
  itemsTriaged: number;
  itemsEscalated: number;
  itemsExplained: number;
}
interface AnalysisView {
  analysisId: string;
  status: Status;
  progress: Progress;
  error: string | null;
}

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const STAGES: { key: Status; label: string; detail: (p: Progress) => string }[] = [
  { key: "discovering", label: "Finding the official agenda pages", detail: (p) => (p.sourcesFound ? n(p.sourcesFound, "official source", "official sources") : "") },
  { key: "reading", label: "Reading the agendas", detail: (p) => (p.docsRead ? n(p.docsRead, "meeting", "meetings") : "") },
  { key: "triaging", label: "Sorting every item", detail: (p) => (p.itemsTriaged ? `${n(p.itemsTriaged, "item", "items")}, ${p.itemsEscalated} to explain` : "") },
  { key: "explaining", label: "Explaining the important decisions", detail: (p) => (p.itemsEscalated ? `${p.itemsExplained} of ${p.itemsEscalated}` : "") },
  { key: "assembling", label: "Putting the briefing together", detail: () => "" },
];
const ORDER: Status[] = ["queued", "discovering", "reading", "triaging", "explaining", "assembling", "done"];

export function StartAnalysis({ placeId, placeName, stateName }: { placeId: string; placeName: string; stateName: string }) {
  const router = useRouter();
  const [a, setA] = useState<AnalysisView | null>(null);
  const [limit, setLimit] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const running = useRef(false);

  const drive = useCallback(
    async (id: string) => {
      if (running.current) return;
      running.current = true;
      try {
        for (let i = 0; i < 200; i++) {
          const r = await fetch(`/api/analyses/${id}/advance`, { method: "POST" });
          const j = (await r.json()) as AnalysisView;
          if (r.status === 409) {
            setA(j);
            await new Promise((res) => setTimeout(res, 3000));
            continue;
          }
          if (!r.ok) throw new Error("step failed");
          setA(j);
          if (j.status === "done") {
            router.refresh();
            return;
          }
          if (j.status === "failed") {
            setFailure(j.error ?? "The analysis stopped.");
            return;
          }
        }
      } catch {
        setFailure("The connection was interrupted. Reload the page to continue where it stopped.");
      } finally {
        running.current = false;
      }
    },
    [router],
  );

  const start = useCallback(async () => {
    setFailure(null);
    setStarting(true);
    let r: Response;
    let j: { analysisId: string; status: Status; error?: { message: string } };
    try {
      r = await fetch("/api/analyses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ placeId }) });
      j = await r.json();
    } catch {
      return setFailure("Townwatch could not be reached. Check your connection and try again.");
    } finally {
      setStarting(false);
    }
    if (r.status === 429) return setLimit(j.error?.message ?? "No new place can be started today.");
    if (!r.ok) return setFailure(j.error?.message ?? "This place cannot be read.");
    if (j.status === "done") return router.refresh();
    setA({ analysisId: j.analysisId, status: j.status, progress: { sourcesFound: 0, docsRead: 0, itemsTriaged: 0, itemsEscalated: 0, itemsExplained: 0 }, error: null });
    drive(j.analysisId);
  }, [placeId, drive, router]);

  const current = a ? ORDER.indexOf(a.status === "queued" ? "discovering" : a.status) : -1;

  return (
    <section className={styles.panel} aria-labelledby="start-title">
      <h2 id="start-title" className={styles.title}>
        Nobody has read {placeName}&rsquo;s agendas here yet.
      </h2>
      {!a && !limit && (
        <>
          <p className={styles.lead}>
            Townwatch can find the official agendas of {placeName}, {stateName}, and explain what is being decided. It takes a few minutes and you can
            watch it happen.
          </p>
          <button type="button" className={styles.button} onClick={start} disabled={starting}>
            {starting ? "Starting…" : "Read the agendas"}
          </button>
        </>
      )}

      {limit && (
        <div className={styles.limit} role="status">
          <p>{limit}</p>
          <Link href="/#places">See the places ready to read</Link>
        </div>
      )}

      {a && (
        <ol className={styles.stages} aria-live="polite">
          {STAGES.map((s) => {
            const idx = ORDER.indexOf(s.key);
            const state = a.status === "failed" ? (idx < current ? "done" : idx === current ? "failed" : "todo") : idx < current ? "done" : idx === current ? "active" : "todo";
            return (
              <li key={s.key} className={styles[state]}>
                <span className={styles.stageIcon} aria-hidden>
                  {state === "done" ? <Check size={20} weight="bold" /> : state === "active" ? <CircleNotch size={20} className={styles.spin} /> : state === "failed" ? <WarningCircle size={20} /> : <Circle size={20} />}
                </span>
                <span className={styles.stageLabel}>{s.label}</span>
                <span className={styles.stageDetail}>{s.detail(a.progress)}</span>
                <span className="visually-hidden">{state === "done" ? "done" : state === "active" ? "in progress" : state === "failed" ? "stopped" : "waiting"}</span>
              </li>
            );
          })}
        </ol>
      )}

      {failure && (
        <div className={styles.limit} role="alert">
          <p>{failure}</p>
          <button type="button" className={styles.linkButton} onClick={start}>
            Try again
          </button>
        </div>
      )}
    </section>
  );
}

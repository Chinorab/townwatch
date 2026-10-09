"use client";
// Place search (FR-001): the state is always shown so same-named places cannot be confused.
import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ArrowRight, MagnifyingGlass } from "@phosphor-icons/react";
import styles from "./search.module.css";

interface Candidate {
  placeId: string;
  name: string;
  stateName: string;
  kind: "county" | "town";
  analysed: boolean;
}

export function PlaceSearch() {
  const inputId = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Candidate[] | null>(null);
  const [error, setError] = useState(false);

  const active = q.trim().length >= 2;
  const shown = active ? results : null;

  useEffect(() => {
    if (q.trim().length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/places?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const j = (await r.json()) as { candidates: Candidate[] };
        setResults(j.candidates);
        setError(false);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(true);
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  return (
    <div className={styles.search}>
      <label htmlFor={inputId} className={styles.label}>
        Your county or town
      </label>
      <div className={styles.field}>
        <MagnifyingGlass aria-hidden size={22} className={styles.fieldIcon} />
        <input
          id={inputId}
          className={styles.input}
          type="search"
          name="place"
          autoComplete="off"
          spellCheck={false}
          placeholder="Edgecombe County, NC…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-describedby={`${inputId}-help`}
        />
      </div>
      <p id={`${inputId}-help`} className={styles.help}>
        Add the state if the name exists in several states.
      </p>
      <div aria-live="polite">
        {error && <p className={styles.message}>Search is not responding. Try again in a moment.</p>}
        {shown && shown.length === 0 && <p className={styles.message}>No US county or town by that name.</p>}
        {shown && shown.length > 0 && (
          <ul className={styles.results}>
            {shown.map((c) => (
              <li key={c.placeId}>
                <Link href={`/${c.placeId}`} className={styles.result}>
                  <span className={styles.resultName}>{c.name}</span>
                  <span className={styles.resultState}>{c.stateName}</span>
                  <span className={styles.resultStatus}>{c.analysed ? "Briefing ready" : "Not read yet"}</span>
                  <ArrowRight aria-hidden size={18} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

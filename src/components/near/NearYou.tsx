"use client";
// "Near you" (US3): items whose record names a place close to the reader. The address is
// geocoded from this browser by the Census Bureau, or replaced by a pin; distances are computed
// here. Nothing about the reader is sent to Townwatch.
import { useId, useState } from "react";
import dynamic from "next/dynamic";
import { MapPin } from "@phosphor-icons/react";
import { geocodeAddress } from "@/client/geocode";
import { rankNearby, NEAR_RADIUS_MILES, type NearStatus, type Point } from "@/client/near";
import styles from "./near.module.css";

const PinMap = dynamic(() => import("./PinMap").then((m) => m.PinMap), { ssr: false, loading: () => <div className={styles.mapLoading}>Loading the map</div> });

export interface LocatedItem {
  id: string;
  lat: number;
  lon: number;
  placeText: string;
  number: string;
  title: string;
  meetingBody: string;
  meetingDate: string;
  href: string;
}

const STATUS_TEXT: Record<Exclude<NearStatus, "ok">, string> = {
  none_nearby: `No item on these agendas names a place within ${NEAR_RADIUS_MILES} miles of you.`,
  outside_area: "This point is outside the area covered by this briefing.",
  no_locations: "No item on these agendas names a specific place.",
};

export function NearYou({ placeName, stateCode, centre, located }: { placeName: string; stateCode: string; centre: Point; located: LocatedItem[] }) {
  const inputId = useId();
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usePin, setUsePin] = useState(false);
  const [result, setResult] = useState<{ status: NearStatus; items: (LocatedItem & { miles: number })[]; from: string } | null>(null);

  const rank = (p: Point, from: string) => {
    setResult({ ...rankNearby(p, located, centre), from });
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const q = /\b[A-Z]{2}\b|\d{5}/.test(address) ? address : `${address}, ${stateCode}`;
      const hit = await geocodeAddress(q);
      if (!hit) setError("The Census Bureau could not find this address. Add the town and state, or drop a pin instead.");
      else rank(hit.point, hit.matched);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.near} aria-labelledby="near-title">
      <h2 id="near-title" className={styles.title}>
        Near you
      </h2>
      {located.length === 0 ? (
        <p className={styles.dek}>{STATUS_TEXT.no_locations}</p>
      ) : (
        <>
          <p className={styles.dek}>
            {located.length} {located.length === 1 ? "item names" : "items name"} a place in or around {placeName}. See which ones are close to you.
          </p>
          <form className={styles.form} onSubmit={submit}>
            <label htmlFor={inputId} className={styles.label}>
              Your street address
            </label>
            <div className={styles.row}>
              <input
                id={inputId}
                className={styles.input}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                autoComplete="street-address"
                placeholder="Street, town, state"
                aria-describedby={`${inputId}-help`}
              />
              <button className={styles.button} type="submit" disabled={busy}>
                {busy ? "Looking up" : "Show what is near me"}
              </button>
            </div>
            <p id={`${inputId}-help`} className={styles.help}>
              Your address goes from this browser to the US Census Bureau to find its position. Townwatch never receives it.{" "}
              <button type="button" className={styles.linkButton} onClick={() => setUsePin(true)}>
                Drop a pin on a map instead
              </button>
            </p>
          </form>
          {usePin && <PinMap centre={centre} onPick={(p) => rank(p, "the pin you placed")} />}

          <div aria-live="polite">
            {error && <p className={styles.error}>{error}</p>}
            {result && result.status !== "ok" && <p className={styles.message}>{STATUS_TEXT[result.status]}</p>}
            {result && result.status === "ok" && (
              <>
                <p className={styles.message}>Closest to {result.from}:</p>
                <ol className={styles.list}>
                  {result.items.map((i) => (
                    <li key={`${i.id}-${i.placeText}`}>
                      <span className={`${styles.distance} num`}>
                        <MapPin aria-hidden size={18} />
                        {i.miles < 0.1 ? "here" : `${i.miles.toFixed(1)} mi`}
                      </span>
                      <span>
                        <a href={i.href}>{i.title}</a>
                        <span className={styles.meta}>
                          Mentions {i.placeText}. {i.meetingBody}, item {i.number}.
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}

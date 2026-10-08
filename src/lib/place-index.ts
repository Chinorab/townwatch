// Official names and internal points of US counties and incorporated places (Census Gazetteer
// 2024, built by scripts/build-places.mjs). Lookup data only: the pipeline has no per-city rule.
import raw from "@/data/places.json";
import { STATE_NAMES } from "./places";

export interface IndexedPlace {
  placeId: string;
  name: string;
  state: string;
  kind: "county" | "town";
  lat: number;
  lon: number;
}

const ALL: IndexedPlace[] = (raw as [string, string, string, "c" | "t", number, number][])
  .filter((r) => STATE_NAMES[r[2]])
  .map(([placeId, name, state, k, lat, lon]) => ({ placeId, name, state, kind: k === "c" ? "county" : "town", lat, lon }));
const BY_ID = new Map(ALL.map((p) => [p.placeId, p]));

export function lookupPlace(placeId: string): IndexedPlace | null {
  return BY_ID.get(placeId) ?? null;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
const STATE_BY_NAME = new Map(Object.entries(STATE_NAMES).map(([code, name]) => [norm(name), code]));

/** "Edgecombe County, NC", "ann arbor michigan", "columbia county ga" → best matches. */
export function searchPlaces(query: string, limit = 8): IndexedPlace[] {
  let q = norm(query);
  if (q.length < 2) return [];
  let state: string | null = null;
  for (const [name, code] of STATE_BY_NAME) {
    if (q.endsWith(` ${name}`)) {
      state = code;
      q = q.slice(0, -name.length - 1).trim();
      break;
    }
  }
  const tail = q.match(/ ([a-z]{2})$/);
  if (!state && tail && STATE_NAMES[tail[1].toUpperCase()]) {
    state = tail[1].toUpperCase();
    q = q.slice(0, -3).trim();
  }
  const scored: { p: IndexedPlace; s: number }[] = [];
  for (const p of ALL) {
    if (state && p.state !== state) continue;
    const n = norm(p.name);
    const s = n === q ? 0 : n.startsWith(q) ? 1 : n.includes(` ${q}`) ? 2 : -1;
    if (s >= 0) scored.push({ p, s: s * 10 + (p.kind === "county" ? 0 : 1) });
  }
  return scored.sort((a, b) => a.s - b.s || a.p.name.localeCompare(b.p.name)).slice(0, limit).map((x) => x.p);
}

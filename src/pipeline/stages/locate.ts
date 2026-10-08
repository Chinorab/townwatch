// Locate the places an agenda item names (roads, subdivisions, addresses, facilities), so
// "Near you" can rank items by distance in the reader's browser (FR-016, research R8).
// These are public-record texts, never the reader's address. OpenStreetMap Nominatim, one
// request per second as its usage policy asks, cached per place and text, results kept only
// when they fall inside the place's area.
import { sha256 } from "@/lib/store";
import type { AgendaItem, ItemLocation } from "@/lib/schemas";
import type { Ctx } from "../context";

export interface PlaceArea {
  name: string;
  state: string;
  centre: { lat: number; lon: number };
}

const MAX_LOOKUPS = 40;
const MAX_MILES_FROM_CENTRE = 45;

function miles(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lon - a.lon) / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function geocode(ctx: Ctx, area: PlaceArea, text: string, pauseMs: number): Promise<ItemLocation | null> {
  const key = `geo:${sha256(`${area.name}|${area.state}|${text}`)}`;
  const hit = await ctx.kv.get<ItemLocation | false>(key);
  if (hit !== null) return hit || null;
  const q = `${text}, ${area.name}, ${area.state}`;
  const d = 0.6; // about 40 miles: search inside the place's surroundings only
  const url =
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&bounded=1` +
    `&viewbox=${area.centre.lon - d},${area.centre.lat + d},${area.centre.lon + d},${area.centre.lat - d}` +
    `&q=${encodeURIComponent(q)}`;
  let found: ItemLocation | false = false;
  try {
    if (pauseMs) await new Promise((r) => setTimeout(r, pauseMs));
    const r = await ctx.fetcher(url);
    if (r.status === 200) {
      const [best] = JSON.parse(new TextDecoder().decode(r.bytes)) as { lat: string; lon: string; class?: string; addresstype?: string }[];
      if (best) {
        const point = { lat: +best.lat, lon: +best.lon };
        if (miles(point, area.centre) <= MAX_MILES_FROM_CENTRE) {
          const precision = best.class === "highway" || best.addresstype === "road" ? "road" : best.addresstype === "house" || best.class === "building" ? "address" : "place";
          found = { text, ...point, precision };
        }
      }
    }
  } catch {
    return null; // geocoder unavailable: no location, no cache, try again next run
  }
  await ctx.kv.set(key, found);
  return found || null;
}

/** Parcel numbers, tax map references and case ids are not places a geocoder can find; a match
 *  on them is noise ("Parcel 104" was matched to a random point on 2026-10-08). */
export function isPlaceName(t: string): boolean {
  if (t.length < 4) return false;
  if (/^(tax )?(map|parcel|lot|tract|pin|case|item|attachment|exhibit|section|district)\b/i.test(t)) return false;
  return /[a-z]{3,}/i.test(t.replace(/\b(parcel|tax|map|lot|no|number)\b/gi, ""));
}

/** @param pauseMs delay between live lookups (1 s in production, 0 in tests). */
export async function locateItems(ctx: Ctx, area: PlaceArea, items: AgendaItem[], pauseMs = process.env.NODE_ENV === "test" ? 0 : 1_000): Promise<AgendaItem[]> {
  const texts = [...new Set(items.flatMap((i) => i.triage?.locationsMentioned ?? []).map((t) => t.trim()).filter(isPlaceName))].slice(0, MAX_LOOKUPS);
  const located = new Map<string, ItemLocation | null>();
  for (const t of texts) located.set(t, await geocode(ctx, area, t, located.size ? pauseMs : 0));
  return items.map((i) => ({
    ...i,
    locations: (i.triage?.locationsMentioned ?? []).map((t) => located.get(t.trim()) ?? null).filter((l): l is ItemLocation => l !== null),
  }));
}

// "Near you" maths, run in the browser only: the user's position never leaves the device.
export interface Point {
  lat: number;
  lon: number;
}

/** Items within this distance of the user are "near you". Rural counties are wide. */
export const NEAR_RADIUS_MILES = 10;
/** Beyond this distance from the place's centre, the address is not in the area. */
export const OUTSIDE_AREA_MILES = 60;

export function milesBetween(a: Point, b: Point): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type NearStatus = "ok" | "none_nearby" | "outside_area" | "no_locations";

export function rankNearby<T extends Point & { id: string }>(user: Point, items: T[], placeCentre: Point): { status: NearStatus; items: (T & { miles: number })[] } {
  if (milesBetween(user, placeCentre) > OUTSIDE_AREA_MILES) return { status: "outside_area", items: [] };
  if (items.length === 0) return { status: "no_locations", items: [] };
  // An item naming several places (a striping contract lists many roads) appears once, at its
  // nearest mention.
  const best = new Map<string, T & { miles: number }>();
  for (const i of items) {
    const m = milesBetween(user, i);
    if (m > NEAR_RADIUS_MILES) continue;
    const prev = best.get(i.id);
    if (!prev || m < prev.miles) best.set(i.id, { ...i, miles: m });
  }
  const near = [...best.values()].sort((a, b) => a.miles - b.miles);
  return near.length ? { status: "ok", items: near } : { status: "none_nearby", items: [] };
}

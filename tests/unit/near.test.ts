// T053: "Near you" ranking, computed in the browser (FR-016, principle VI).
import { describe, expect, it } from "vitest";
import { milesBetween, rankNearby, NEAR_RADIUS_MILES, OUTSIDE_AREA_MILES } from "@/client/near";

const tarboroCourthouse = { lat: 35.8961, lon: -77.5324 }; // 201 Saint Andrew Street, Census geocoder
const items = [
  { id: "deer-run", lat: 35.95, lon: -77.6 },
  { id: "cherry-hill", lat: 35.99, lon: -77.42 },
  { id: "far", lat: 36.4, lon: -77.0 },
];

describe("milesBetween", () => {
  it("measures great-circle distance in miles", () => {
    expect(milesBetween({ lat: 35.8961, lon: -77.5324 }, { lat: 35.8961, lon: -77.5324 })).toBe(0);
    // Tarboro to Rocky Mount city hall is about 16 miles
    expect(milesBetween(tarboroCourthouse, { lat: 35.9382, lon: -77.7905 })).toBeGreaterThan(14);
    expect(milesBetween(tarboroCourthouse, { lat: 35.9382, lon: -77.7905 })).toBeLessThan(18);
  });
});

describe("rankNearby", () => {
  it("orders located items by distance and keeps those within the radius", () => {
    const r = rankNearby(tarboroCourthouse, items, { lat: 35.9171, lon: -77.6027 });
    expect(r.status).toBe("ok");
    expect(r.items.map((i) => i.id)).toEqual(["deer-run", "cherry-hill"]);
    expect(r.items[0].miles).toBeLessThan(r.items[1].miles);
    expect(r.items.every((i) => i.miles <= NEAR_RADIUS_MILES)).toBe(true);
  });

  it("lists an item that names several places once, at its nearest mention", () => {
    const multi = [
      { id: "striping", lat: 35.99, lon: -77.42 },
      { id: "striping", lat: 35.9, lon: -77.53 },
      { id: "other", lat: 35.95, lon: -77.6 },
    ];
    const r = rankNearby(tarboroCourthouse, multi, { lat: 35.9171, lon: -77.6027 });
    expect(r.items.map((i) => i.id)).toEqual(["striping", "other"]);
    expect(r.items[0].lon).toBe(-77.53);
  });

  it("says when nothing on the agendas is near the address", () => {
    const r = rankNearby(tarboroCourthouse, [{ id: "far", lat: 36.4, lon: -77.0 }], { lat: 35.9171, lon: -77.6027 });
    expect(r).toEqual({ status: "none_nearby", items: [] });
  });

  it("says when the address is outside the area", () => {
    const raleigh = { lat: 35.7796, lon: -78.6382 };
    const r = rankNearby({ lat: 37.5, lon: -80 }, items, { lat: 35.9171, lon: -77.6027 });
    expect(r.status).toBe("outside_area");
    expect(milesBetween(raleigh, { lat: 35.9171, lon: -77.6027 })).toBeLessThan(OUTSIDE_AREA_MILES);
  });

  it("handles a briefing with no located item", () => {
    expect(rankNearby(tarboroCourthouse, [], { lat: 35.9171, lon: -77.6027 })).toEqual({ status: "no_locations", items: [] });
  });
});

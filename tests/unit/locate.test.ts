import { describe, expect, it } from "vitest";
import { isPlaceName, locateItems } from "@/pipeline/stages/locate";
import { testContext } from "@/pipeline/context";
import type { AgendaItem } from "@/lib/schemas";

const centre = { lat: 35.9171, lon: -77.6027 }; // Edgecombe County internal point
const item = (h: string, places: string[]): AgendaItem => ({
  itemHash: h,
  number: h,
  title: h,
  text: h,
  meetingId: "m",
  docHash: "d",
  docUrl: "u",
  page: null,
  triage: { topic: "roads_transport", routine: false, decisionExpected: true, impact: "medium", locationsMentioned: places, importance: 3 },
});
const json = (v: unknown) => ({ status: 200, contentType: "application/json", bytes: new TextEncoder().encode(JSON.stringify(v)) });

describe("locateItems", () => {
  it("geocodes places named in the record near the place, once per text", async () => {
    const asked: string[] = [];
    const ctx = testContext({
      fetcher: async (url) => {
        asked.push(decodeURIComponent(url));
        if (url.includes("Cherry%20Hill%20Road")) return json([{ lat: "35.99", lon: "-77.42", class: "highway", addresstype: "road" }]);
        if (url.includes("Mars%20Street")) return json([{ lat: "40.0", lon: "-100.0", class: "highway", addresstype: "road" }]); // far away
        return json([]);
      },
    });
    const items = [item("a", ["Cherry Hill Road"]), item("b", ["Cherry Hill Road", "Mars Street", "Nowhere Plaza"])];
    const out = await locateItems(ctx, { name: "Edgecombe County", state: "NC", centre }, items, 0);
    expect(out[0].locations).toEqual([{ text: "Cherry Hill Road", lat: 35.99, lon: -77.42, precision: "road" }]);
    expect(out[1].locations!.map((l) => l.text)).toEqual(["Cherry Hill Road"]); // too far and unknown dropped
    expect(asked.filter((u) => u.includes("Cherry Hill Road"))).toHaveLength(1); // cached
    expect(asked[0]).toContain("Edgecombe County, NC");
    expect(asked[0]).toMatch(/^https:\/\/nominatim\.openstreetmap\.org\/search\?/);
  });

  it("never fails the analysis when the geocoder is down", async () => {
    const ctx = testContext({
      fetcher: async () => {
        throw new Error("down");
      },
    });
    const out = await locateItems(ctx, { name: "Edgecombe County", state: "NC", centre }, [item("a", ["Cherry Hill Road"])], 0);
    expect(out[0].locations).toEqual([]);
  });
});


describe("isPlaceName", () => {
  it("keeps roads, addresses and facilities", () => {
    for (const t of ["Cherry Hill Road", "25 William Few Pkwy", "Blanchard Woods Park", "Deer Run Subdivision"]) expect(isPlaceName(t), t).toBe(true);
  });
  it("drops parcel, tax map and case references", () => {
    for (const t of ["Parcel 104", "Tax Map 067 Parcel 104", "Lot 214", "Case 26-PG01", "B-1"]) expect(isPlaceName(t), t).toBe(false);
  });
});

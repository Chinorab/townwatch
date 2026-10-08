import { describe, expect, it } from "vitest";
import { lookupPlace, searchPlaces } from "@/lib/place-index";

describe("place search on the Census Gazetteer index", () => {
  it("finds a county by name and state, in any common spelling", () => {
    for (const q of ["Edgecombe County, NC", "edgecombe county north carolina", "Edgecombe"]) expect(searchPlaces(q)[0].placeId).toBe("nc-edgecombe-county");
  });
  it("asks the state when a name exists in several states", () => {
    const states = new Set(searchPlaces("Columbia County").map((p) => p.state));
    expect(states.size).toBeGreaterThan(3);
    expect(searchPlaces("columbia county ga")[0].placeId).toBe("ga-columbia-county");
  });
  it("finds towns without their legal suffix", () => {
    expect(searchPlaces("Ann Arbor, MI")[0]).toMatchObject({ placeId: "mi-ann-arbor", kind: "town", name: "Ann Arbor" });
  });
  it("keeps official capitalisation", () => {
    expect(lookupPlace("nc-mcdowell-county")?.name).toBe("McDowell County");
  });
});

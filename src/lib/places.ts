// Place identifiers: "{state}-{slug}", for example "nc-edgecombe-county" or "mi-ann-arbor".
// Data only, used for naming; nothing here is per-city configuration of the pipeline.
import type { BodyRole, Place } from "./schemas";

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

const COUNTY_SUFFIX = /-(county|parish|borough|census-area|municipality|city-and-borough)$/;

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w === "and" ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export function placeFromId(placeId: string, countyName?: string): Place {
  const m = placeId.match(/^([a-z]{2})-([a-z0-9-]+)$/);
  if (!m) throw new Error(`Invalid place id "${placeId}" (expected e.g. nc-edgecombe-county)`);
  const state = m[1].toUpperCase();
  const stateName = STATE_NAMES[state];
  if (!stateName) throw new Error(`Unknown state "${state}"`);
  const kind = COUNTY_SUFFIX.test(m[2]) ? "county" : "town";
  return {
    placeId,
    name: titleCase(m[2]),
    kind,
    state,
    stateName,
    countyName: countyName ?? null,
    bodies: [],
    lastAnalysisId: null,
    followed: false,
  };
}

/** Bodies covered per place kind (FR-004), with the phrase used to search for each. */
export function bodiesFor(place: Place): { role: BodyRole; phrase: string }[] {
  if (place.kind === "county") {
    return [
      { role: "county_executive", phrase: "board of commissioners county council" },
      { role: "school_board", phrase: "board of education school board" },
      { role: "planning", phrase: "planning board planning commission" },
    ];
  }
  return [
    { role: "executive", phrase: "city council town council" },
    { role: "county_executive", phrase: "county board of commissioners" },
    { role: "school_board", phrase: "board of education school board" },
  ];
}

export function placeLabel(place: Place): string {
  return `${place.name}, ${place.stateName}`;
}

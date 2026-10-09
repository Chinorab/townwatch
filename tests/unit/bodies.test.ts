import { describe, expect, it } from "vitest";
import { matchesRole } from "@/pipeline/readers/bodies";

// Body names as they appear on the Legistar and CivicClerk portals of the demo places.
describe("matchesRole", () => {
  it("keeps the main governing bodies", () => {
    expect(matchesRole("City Council", "executive")).toBe(true);
    expect(matchesRole("Board of Commissioners Meeting", "county_executive")).toBe(true);
    expect(matchesRole("Planning Commission", "planning")).toBe(true);
  });

  it("drops sub-bodies that share their words", () => {
    expect(matchesRole("Retiree Health Care Benefit Plan & Trust Board of Trustees (VEBA)", "executive")).toBe(false);
    expect(matchesRole("Board of Commissioners Working Session", "county_executive")).toBe(false);
    expect(matchesRole("Council Policy Agenda Committee", "executive")).toBe(false);
  });
});

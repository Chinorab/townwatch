import { describe, expect, it } from "vitest";
import { otherStateHost } from "@/pipeline/stages/verify";

describe("otherStateHost", () => {
  it("flags domains that name another state", () => {
    expect(otherStateHost("https://www.cumberlandcountync.gov/departments/x", "VA")).toBe("NC");
    expect(otherStateHost("http://www.co.lincoln.nc.us/archive", "CO")).toBe("NC");
    expect(otherStateHost("https://www.lincolncountync.gov/agendacenter", "CO")).toBe("NC");
  });
  it("accepts the place's own state and neutral domains", () => {
    expect(otherStateHost("https://co.caroline.va.us/AgendaCenter", "VA")).toBeNull();
    expect(otherStateHost("https://www.wascocountyor.gov/x", "OR")).toBeNull();
    expect(otherStateHost("https://www.ecps.us/apps/pages/index.jsp", "NC")).toBeNull();
    expect(otherStateHost("https://columbiacoga.portal.civicclerk.com/", "GA")).toBeNull();
  });
});

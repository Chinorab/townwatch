import { describe, expect, it } from "vitest";
import { otherCountyHost, otherStateHost } from "@/pipeline/stages/verify";

describe("otherStateHost", () => {
  it("flags domains that name another state", () => {
    expect(otherStateHost("https://www.cumberlandcountync.gov/departments/x", "VA")).toBe("NC");
    expect(otherStateHost("http://www.co.lincoln.nc.us/archive", "CO")).toBe("NC");
    expect(otherStateHost("https://www.lincolncountync.gov/agendacenter", "CO")).toBe("NC");
  });
  it("flags state names spelled out in the domain", () => {
    expect(otherStateHost("https://www.mcohio.org/AgendaCenter", "GA")).toBe("OH");
    expect(otherStateHost("https://cumberlandcounty.virginia.gov/agendacenter", "VA")).toBeNull();
    expect(otherStateHost("https://www.arkansas.gov/x", "AR")).toBeNull();
  });

  it("flags county plus state code domains", () => {
    expect(otherStateHost("https://www.franklincotn.us/agendas_minutes_commission.html", "AR")).toBe("TN");
  });

  it("accepts the place's own state and neutral domains", () => {
    expect(otherStateHost("https://co.caroline.va.us/AgendaCenter", "VA")).toBeNull();
    expect(otherStateHost("https://www.wascocountyor.gov/x", "OR")).toBeNull();
    expect(otherStateHost("https://www.ecps.us/apps/pages/index.jsp", "NC")).toBeNull();
    expect(otherStateHost("https://columbiacoga.portal.civicclerk.com/", "GA")).toBeNull();
  });
});


describe("otherCountyHost", () => {
  it("flags another county's domain", () => {
    expect(otherCountyHost("https://www.salinecounty.org/government/planning_board", "franklin")).toBe("saline");
    expect(otherCountyHost("https://www.rockinghamcountync.gov/21500/Meeting-Agendas", "edgecombe")).toBe("rockingham");
  });
  it("accepts the place's own and neutral domains", () => {
    expect(otherCountyHost("https://www.edgecombecountync.gov/residents/agendas.php", "edgecombe")).toBeNull();
    expect(otherCountyHost("https://co.caroline.va.us/AgendaCenter", "caroline")).toBeNull();
    expect(otherCountyHost("https://www.ecps.us/apps/pages/index.jsp", "edgecombe")).toBeNull();
    expect(otherCountyHost("https://columbiacoga.portal.civicclerk.com/", "columbia")).toBeNull();
    expect(otherCountyHost("https://www.countyoffice.org/x", "wasco")).toBeNull();
  });
});

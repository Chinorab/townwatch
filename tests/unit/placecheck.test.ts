import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { letterheadOtherState } from "@/pipeline/stages/placecheck";

describe("letterheadOtherState", () => {
  it("catches an agenda from a same-named place in another state", () => {
    const vernonCT = "VERNON PUBLIC SCHOOLS\nVernon, Connecticut 06066\nSPECIAL BOARD OF EDUCATION MEETING";
    expect(letterheadOtherState(vernonCT, "LA")).toBe("CT");
    expect(letterheadOtherState("Town Hall, Evans, GA 30809 Agenda", "SC")).toBe("GA");
  });

  it("accepts the place's own letterhead (real Edgecombe agenda)", () => {
    const edgecombe = readFileSync("tests/fixtures/edgecombe-agenda-2026-10-05.md", "utf8");
    expect(letterheadOtherState(edgecombe, "NC")).toBeNull();
    expect(letterheadOtherState("Tarboro, NC 27886 Agenda", "NC")).toBeNull();
  });

  it("ignores other states mentioned after the letterhead", () => {
    const text = "Board of Commissioners, Tarboro, NC 27886\n" + "x".repeat(500) + "\nGrant from the U.S. Department of Justice, Washington, DC 20530";
    expect(letterheadOtherState(text, "NC")).toBeNull();
  });
});

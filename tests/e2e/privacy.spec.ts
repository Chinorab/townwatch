// T054 / SC-007: after an address is entered in "Near you", no request to Townwatch carries it.
// Run: npx playwright test tests/e2e/privacy.spec.ts (dev server on :3747, demo briefings cached).
import { test, expect } from "@playwright/test";

const ADDRESS = "630 Ronald Reagan Drive, Evans, GA 30809"; // public county office from the record

test("the address only goes to the Census geocoder", async ({ page }) => {
  const toUs: string[] = [];
  const toCensus: string[] = [];
  page.on("request", (r) => {
    const url = r.url();
    const body = r.postData() ?? "";
    if (url.startsWith("http://localhost:3747")) toUs.push(decodeURIComponent(url) + " " + body);
    if (url.includes("geocoding.geo.census.gov")) toCensus.push(url);
  });
  await page.goto("/ga-columbia-county");
  await page.getByLabel("Your street address").fill(ADDRESS);
  await page.getByRole("button", { name: "Show what is near me" }).click();
  await expect(page.getByText(/Closest to/)).toBeVisible({ timeout: 20_000 });

  expect(toCensus.length).toBe(1);
  for (const part of ["Ronald", "Reagan", "30809", "Evans"]) {
    expect(toUs.filter((u) => u.toLowerCase().includes(part.toLowerCase()))).toEqual([]);
  }
});

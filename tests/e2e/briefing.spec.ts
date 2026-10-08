// T038: the briefing page in a real browser. Run: npx playwright test (dev server on :3747,
// Edgecombe briefing cached). Checks principle I on the rendered page, not just in data.
import { test, expect } from "@playwright/test";

const PLACE = "/nc-edgecombe-county";

test.describe("Edgecombe briefing", () => {
  test("every paragraph of every story links to its official source", async ({ page }) => {
    await page.goto(PLACE);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("This week in Edgecombe County");
    const paragraphs = page.locator("article div > p");
    const count = await paragraphs.count();
    expect(count).toBeGreaterThan(5);
    for (let i = 0; i < count; i++) {
      const link = paragraphs.nth(i).locator("a[href]");
      await expect(link).toHaveCount(1);
      const href = await link.getAttribute("href");
      expect(new URL(href!).hostname).toMatch(/edgecombecountync\.gov|edl\.io/);
      await expect(link).toHaveText(/^Item [\w.]+(, page \d+)?$/);
    }
  });

  test("the disclaimer is visible and the water system item leads", async ({ page }) => {
    await page.goto(PLACE);
    await expect(page.getByText("Automatic summary. The official record prevails")).toBeVisible();
    await expect(page.locator("article").first()).toContainText("water system");
  });

  test("missing values read 'not stated in the record'", async ({ page }) => {
    await page.goto(PLACE);
    await expect(page.getByText("not stated in the record").first()).toBeVisible();
  });

  test("our own copy uses no dashes", async ({ page }) => {
    await page.goto(PLACE);
    const ui = await page.locator("h1, header p, footer, summary, nav").allInnerTexts();
    expect(ui.join(" ")).not.toMatch(/[–—]/);
  });

  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    test(`renders without horizontal scroll at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(PLACE);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `research/screens/briefing-${viewport.width}.png`, fullPage: true });
    });
  }
});

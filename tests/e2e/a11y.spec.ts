// T069: accessibility audit in a real browser. axe-core checks WCAG 2.1 AA (contrast included)
// in light and dark mode; keyboard and focus are checked by hand below.
// Run against production: E2E_BASE_URL=https://townwatch-tau.vercel.app npx playwright test a11y
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES = ["/", "/nc-edgecombe-county", "/ga-columbia-county", "/mi-ann-arbor", "/or-hood-river-county", "/nc-watauga-county", "/privacy"];

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} mode`, () => {
    test.use({ colorScheme: scheme });
    for (const path of PAGES) {
      test(`no WCAG AA violation on ${path}`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        // Open the collapsed lists so their content is audited too.
        for (const d of await page.locator("details").all()) await d.evaluate((el) => el.setAttribute("open", ""));
        const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
      });
    }
  });
}

test("the first Tab reaches the skip link, which moves focus to the briefing", async ({ page }) => {
  await page.goto("/nc-edgecombe-county");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Skip to the briefing" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#main$/);
});

test("keyboard focus is always visible", async ({ page }) => {
  await page.goto("/nc-edgecombe-county");
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return { outline: "none", what: "body" };
      if (el.tagName === "NEXTJS-PORTAL") return { outline: "dev tools", what: "the Next.js dev overlay (local only)" };
      const s = getComputedStyle(el);
      return { outline: `${s.outlineStyle} ${s.outlineWidth}`, what: `${el.tagName} "${(el.textContent ?? "").trim().slice(0, 40)}"` };
    });
    expect(focus.outline, `focus ring on ${focus.what}`).not.toMatch(/^none|0px$/);
  }
});

test("the address form works with the keyboard alone", async ({ page }) => {
  await page.goto("/nc-edgecombe-county");
  const field = page.getByLabel("Your street address");
  await field.focus();
  await field.fill("201 St Andrew St, Tarboro, NC");
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Closest to/)).toBeVisible({ timeout: 20_000 });
});

for (const path of ["/", "/privacy", "/or-hood-river-county"]) {
  test(`no horizontal scroll at 390px on ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

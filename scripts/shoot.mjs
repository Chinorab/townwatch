// Visual check: full-page screenshots of a URL at desktop and phone widths, light and dark.
// Usage: node scripts/shoot.mjs <path> <name>
import { chromium } from "@playwright/test";
const [path = "/", name = "page"] = process.argv.slice(2);
// Reuse a locally installed Chromium when the bundled one is missing (PW_CHROMIUM=path).
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [w, h, tag] of [[1280, 900, "desktop"], [390, 844, "phone"]]) {
  for (const scheme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: scheme });
    await page.goto(`http://localhost:3747${path}`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `research/screens/${name}-${tag}-${scheme}.png`, fullPage: true });
    await page.close();
  }
}
await browser.close();
console.log("ok");

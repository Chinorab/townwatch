// Renders the video cards to 1920x1080 PNG: node docs/media/cards/build.mjs (PW_CHROMIUM for a local Chromium).
import { chromium } from "@playwright/test";
import { readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
for (const f of readdirSync(here).filter((n) => n.endsWith(".html"))) {
  await page.goto(pathToFileURL(join(here, f)).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(here, f.replace(/\.html$/, ".png")) });
  console.log("rendered", f);
}
await browser.close();

// Records the screen part of the demo video (docs/video-script.md) with a scripted browser.
// Frames come from Chrome's screencast (JPEG), with their timestamps; build-video.mjs turns them
// into the final cut. A drawn cursor follows the mouse, since a headless screencast has none.
//   BASE=http://localhost:3800 node docs/media/record.mjs
// Use a local production build (npm run build, then npm start -- --port 3800): the live analysis
// of a new place counts against the one-new-place-per-day limit of the visitor's address.
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3800";
const NEW_PLACE = process.env.NEW_PLACE ?? "in-porter-county";
const OUTRO_ONLY = Boolean(process.env.OUTRO_ONLY); // films only the finished briefing of NEW_PLACE
const OUT = OUTRO_ONLY ? "docs/media/raw/outro" : "docs/media/raw/take";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "frames"), { recursive: true });

const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 });
await ctx.addInitScript(() => {
  addEventListener("DOMContentLoaded", () => {
    const c = document.createElement("div");
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 10-7 1.5L9 21z" fill="#16181d" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "-40px", top: "-40px", zIndex: 2147483647, pointerEvents: "none", transition: "transform 80ms" });
    document.documentElement.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = `${e.clientX - 3}px`; c.style.top = `${e.clientY - 2}px`; }, true);
    addEventListener("mousedown", () => (c.style.transform = "scale(0.85)"), true);
    addEventListener("mouseup", () => (c.style.transform = ""), true);
  });
});
const page = await ctx.newPage();

// Screencast: every composited frame, saved with its timestamp.
const frames = [];
const cdp = await ctx.newCDPSession(page);
cdp.on("Page.screencastFrame", async (f) => {
  const name = `f${String(frames.length).padStart(6, "0")}.jpg`;
  writeFileSync(join(OUT, "frames", name), Buffer.from(f.data, "base64"));
  frames.push({ name, t: f.metadata.timestamp });
  await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });

const marks = [];
const mark = (beat) => { marks.push({ beat, t: Date.now() / 1000 }); console.log(new Date().toISOString().slice(11, 19), beat); };
const wait = (ms) => page.waitForTimeout(ms);
let mouse = { x: 760, y: 430 };
async function moveTo(locator, steps = 28) {
  const b = await locator.boundingBox();
  const x = b.x + Math.min(b.width / 2, 60), y = b.y + b.height / 2;
  await page.mouse.move(x, y, { steps });
  mouse = { x, y };
}
async function glide(px, ms = 1800) {
  // Smooth scroll by px over ms, in small wheel steps.
  const n = Math.max(1, Math.round(ms / 40));
  for (let i = 0; i < n; i++) { await page.mouse.wheel(0, px / n); await wait(40); }
}
async function glideTo(locator, offset = 140, ms = 1800) {
  await locator.scrollIntoViewIfNeeded({ timeout: 1 }).catch(() => {});
  const top = await locator.evaluate((el) => el.getBoundingClientRect().top);
  await glide(top - offset, ms);
}

if (!OUTRO_ONLY) {
// 1. Home page, the 213 counties.
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.mouse.move(mouse.x, mouse.y);
await wait(800);
mark("home");
await wait(3500);
await glideTo(page.getByRole("heading", { name: /213 US counties/ }), 160, 2600);
await wait(5000);

// 2. Search for Edgecombe.
mark("search");
await glide(-2000, 1400);
const box = page.getByLabel("Your county or town");
await moveTo(box);
await box.click();
await page.keyboard.type("Edgecombe", { delay: 140 });
const result = page.getByRole("link", { name: /Edgecombe County.*North Carolina/ }).first();
await result.waitFor();
await wait(900);
await moveTo(result, 20);
await wait(600);
await result.click();
await page.waitForURL(/nc-edgecombe-county/);
await page.getByRole("heading", { level: 1 }).waitFor();
await page.waitForLoadState("networkidle");

// 3. The briefing and the water system story.
mark("briefing");
await wait(5000);
await glideTo(page.getByRole("heading", { level: 2, name: /water system/ }), 150, 2200);
await wait(6000);
await glide(700, 3500);
await wait(3500);

// 4. A citation opens the official PDF at the cited page.
mark("citation");
const cite = page.getByRole("link", { name: "Item 8.12.B, page 4" }).first();
await glideTo(cite, 380, 2200);
await moveTo(cite);
await wait(1800);
// Chrome's PDF viewer is not part of the screencast: it is paused, and screenshots stand in.
await cdp.send("Page.stopScreencast");
await cite.click();
await wait(2500);
for (let i = 0; i < 6; i++) {
  const name = `s${String(i).padStart(6, "0")}.jpg`;
  await page.screenshot({ path: join(OUT, "frames", name), type: "jpeg", quality: 92 });
  frames.push({ name, t: Date.now() / 1000 });
  await wait(600);
}
await page.goBack({ waitUntil: "networkidle" });
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
await wait(800);
const notStated = page.getByText("not stated in the record").first();
await glideTo(notStated, 420, 1200);
await moveTo(notStated);
await wait(3500);

// 5. Near you.
mark("near");
const field = page.getByLabel("Your street address");
await glideTo(page.getByRole("heading", { name: "Near you" }), 120, 2000);
await moveTo(field);
await field.click();
await page.keyboard.type("201 St Andrew St, Tarboro, NC", { delay: 70 });
await wait(500);
await page.keyboard.press("Enter");
await page.getByText(/Closest to/).waitFor({ timeout: 30_000 });
await wait(5500);

// 6. How this was made.
mark("made");
await glideTo(page.getByRole("heading", { name: "How this was made" }), 110, 2200);
await wait(9000);
await glideTo(page.getByRole("table"), 260, 1800);
await wait(11000);

}

if (OUTRO_ONLY) {
  await page.goto(`${BASE}/${NEW_PLACE}`, { waitUntil: "networkidle" });
  await page.mouse.move(760, 300);
  await wait(800);
  mark("outro");
  await wait(4000);
  await glide(900, 4000);
  await wait(4000);
  mark("outro-end");
}

// 7. A news desert read live (skipped in rehearsals: it can be filmed once per place).
if (!process.env.SKIP_LIVE && !OUTRO_ONLY) {
mark("live");
await page.goto(`${BASE}/${NEW_PLACE}`, { waitUntil: "networkidle" });
await page.mouse.move(mouse.x, mouse.y);
await wait(3000);
const start = page.getByRole("button", { name: "Read the agendas" });
await moveTo(start);
await wait(800);
await start.click();
mark("live-running");
await page.getByRole("heading", { name: "How this was made" }).waitFor({ timeout: 900_000 });
mark("live-done");
await page.waitForLoadState("networkidle");
await wait(4000);
await glide(900, 4000);
await wait(4000);
}
mark("end");

await cdp.send("Page.stopScreencast");
await wait(300);
writeFileSync(join(OUT, "take.json"), JSON.stringify({ marks, frames }, null, 1));
await browser.close();
console.log(`${frames.length} frames`);

// SC-004: with no configuration, does a news-desert county get a briefing for at least its
// main governing body, in under 5 minutes? Runs the real pipeline on Wasco County, OR (demo
// place) plus 10 counties sampled reproducibly from the Medill 2025 list, and writes
// research/sc004.md. Stops early if the average cost per place passes 0.25 USD.
// Run: node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/sc004.ts
import { readFileSync, writeFileSync } from "node:fs";
import "../src/pipeline/readers/register";
import { createContext } from "../src/pipeline/context";
import { analysePlace } from "../src/pipeline/jobs";
import { placeFromId } from "../src/lib/places";
import { lookupPlace } from "../src/lib/place-index";

const rows = readFileSync("data/medill-2025-news-deserts.tsv", "utf8")
  .split("\n")
  .filter((l) => l && !l.startsWith("#") && !l.startsWith("county\t"))
  .map((l) => l.split("\t"));

// Reproducible sample: counties of 5,000+ people (enough to have online agendas at all), every
// k-th one in alphabetical order.
const eligible = rows.filter((r) => +r[3] >= 5_000 && r[1] !== "AK");
const step = Math.floor(eligible.length / 10);
const sample = Array.from({ length: 10 }, (_, i) => eligible[i * step + 3]);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const ids = ["or-wasco-county", ...sample.map(([county, st]) => {
  const suffix = /parish$/i.test(county) ? "" : /city$/i.test(county) ? "" : " County";
  return `${st.toLowerCase()}-${slug(county + suffix)}`;
})];

const results: string[] = [];
let spent = 0;
let done = 0;
for (const id of ids) {
  const idx = lookupPlace(id);
  if (!idx) {
    results.push(`| ${id} | not in index | | | | | |`);
    continue;
  }
  const ctx = await createContext({ log: () => {} });
  const t0 = Date.now();
  let row: string;
  try {
    const { briefing, newCalls } = await analysePlace(ctx, placeFromId(id, undefined, idx));
    const cost = newCalls.reduce((s, c) => s + c.costUsd, 0);
    spent += cost;
    const covered = briefing.bodies.filter((b) => b.coverage === "covered").map((b) => b.role);
    const mainMeetings = briefing.meetings.filter((m) => m.role === "county_executive" || m.role === "executive").map((m) => m.meetingId);
    const mainItems = briefing.headlineItems.filter((h) => mainMeetings.includes(h.meeting.meetingId)).length + briefing.alsoOnAgenda.filter((a) => mainMeetings.includes(a.meetingId)).length;
    const ok = mainItems > 0;
    const mainSource = briefing.panel.sourcesKept.find((x) => x.role === "county_executive" || x.role === "executive");
    row = `| ${idx.name}, ${idx.state} | ${ok ? "yes" : "no"} | ${mainSource ? new URL(mainSource.url).hostname : "none"} | ${covered.join(", ") || "none"} | ${briefing.panel.itemsTotal} items, ${briefing.headlineItems.length} explained | ${((Date.now() - t0) / 1000).toFixed(0)} s | $${cost.toFixed(3)} |`;
  } catch (err) {
    row = `| ${idx.name}, ${idx.state} | error | | ${String(err).slice(0, 80)} | | ${((Date.now() - t0) / 1000).toFixed(0)} s | |`;
  }
  done++;
  results.push(row);
  console.log(row);
  if (done >= 3 && spent / done > 0.25) {
    results.push(`\nStopped early: average cost $${(spent / done).toFixed(3)} per place passed $0.25.`);
    break;
  }
}

writeFileSync(
  "research/sc004.md",
  `# SC-004 measurement (${new Date().toISOString().slice(0, 10)})

Zero configuration: each county is given by name only. Success = at least one agenda item of the county's
main governing body is read. Sample: Wasco County, OR (demo place) and 10 counties taken
every ${step} rows from the ${eligible.length} Medill 2025 news-desert counties of 5,000+ people
(Alaska boroughs excluded).

| County | Success | Main body source | Bodies covered | Items | Time | Model cost |
|---|---|---|---|---|---|---|
${results.filter((r) => r.startsWith("|")).join("\n")}
${results.filter((r) => !r.startsWith("|")).join("\n")}

Total model spend: $${spent.toFixed(3)}.
`,
);
console.log(`Saved research/sc004.md (spent $${spent.toFixed(3)})`);

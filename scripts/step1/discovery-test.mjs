// Step 1 test: can Tavily alone find the official agenda sources of a US county, with zero
// per-place configuration? No LLM involved: this measures the raw discovery rate.
//
// For each place and each governing body:
//   1. two Tavily searches (basic depth, 1 credit each)
//   2. classify every result URL: official (.gov, .us, k12, known agenda platforms) or not
//   3. extract the best official candidate (basic, 1 credit per 5 URLs)
//   4. score: L1 official portal found / L2 page lists agenda documents / L3 a dated item
//      from the last 75 days or the upcoming weeks is visible
// Run: node --env-file=.env.local scripts/step1/discovery-test.mjs
import { writeFileSync, mkdirSync } from "node:fs";

const key = process.env.TAVILY_API_KEY;
if (!key) {
  console.error("TAVILY_API_KEY is missing (expected in .env.local)");
  process.exit(1);
}

const PLACES = [
  // Medill 2025 news deserts (data/medill-2025-news-deserts.tsv), spread across sizes and states
  { id: "columbia-ga", label: "Columbia County, Georgia", pop: 165162, desert: true,
    bodies: ["Board of Commissioners", "Board of Education"] },
  { id: "edgecombe-nc", label: "Edgecombe County, North Carolina", pop: 48832, desert: true,
    bodies: ["Board of Commissioners", "Board of Education"] },
  { id: "wasco-or", label: "Wasco County, Oregon", pop: 26333, desert: true,
    bodies: ["Board of Commissioners", "School District board"] },
  { id: "allendale-sc", label: "Allendale County, South Carolina", pop: 7369, desert: true,
    bodies: ["County Council", "School District board"] },
  // Comparison: a well-covered city with a large agenda portal
  { id: "ann-arbor-mi", label: "City of Ann Arbor, Michigan", pop: 123851, desert: false,
    bodies: ["City Council", "Planning Commission"] },
];

const PLATFORMS = [
  ["legistar", /legistar\.com/i],
  ["civicplus", /\/AgendaCenter|civicplus\.com|civicengage/i],
  ["boarddocs", /boarddocs\.com/i],
  ["granicus", /granicus\.com|iqm2\.com|novusagenda\.com|primegov\.com/i],
  ["civicclerk", /civicclerk\.com|civicweb\.net|municodemeetings\.com|escribemeetings\.com/i],
  ["simbli", /simbli\.eboardsolutions\.com|eboardsolutions\.com/i],
  ["diligent", /diligent(oneplatform)?\.com|agendaquick|meetingstream/i],
];
const NOT_OFFICIAL = /facebook|twitter|x\.com|youtube|instagram|linkedin|wikipedia|patch\.com|newspaper|news|times|herald|gazette|journal|tribune|courier|ballotpedia|yelp|mapquest/i;

function classify(url) {
  const host = new URL(url).hostname;
  const platform = PLATFORMS.find(([, re]) => re.test(url))?.[0] ?? null;
  const gov = /\.gov$|\.us$|\.k12\.[a-z]{2}\.us$/i.test(host);
  const official = (gov || platform !== null) && !NOT_OFFICIAL.test(host);
  return { host, platform, gov, official };
}

async function tavily(path, body) {
  const t0 = Date.now();
  const r = await fetch("https://api.tavily.com/" + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, include_usage: true }),
    signal: AbortSignal.timeout(90_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${path} ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  return { ...j, ms: Date.now() - t0 };
}

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
const DATE_RES = [
  new RegExp(`\\b(${MONTHS})[a-z]*\\.?\\s+(\\d{1,2}),?\\s+(20\\d\\d)`, "gi"),
  /\b(\d{1,2})[/-](\d{1,2})[/-](20\d\d)\b/g,
  /\b(20\d\d)-(\d{2})-(\d{2})\b/g,
];
function datesIn(text) {
  const out = [];
  for (const re of DATE_RES) {
    for (const m of text.matchAll(re)) {
      const d = new Date(m[0].replace(/(\d)(st|nd|rd|th)/, "$1"));
      if (!Number.isNaN(d.getTime())) out.push(d);
    }
  }
  return out;
}
const DOC_LINK = /\]\((https?:[^)\s]+(\.pdf|ViewFile|View\.ashx|DisplayAgenda|Agenda\/|agenda|minutes|Meeting)[^)\s]*)\)/gi;

const now = new Date();
const recentFrom = new Date(now.getTime() - 75 * 86400e3);
const upcomingTo = new Date(now.getTime() + 45 * 86400e3);

let credits = 0;
const report = { date: now.toISOString(), places: [] };
mkdirSync("research/step1/raw", { recursive: true });

for (const place of PLACES) {
  console.log(`\n=== ${place.label} (pop ${place.pop}${place.desert ? ", news desert" : ""}) ===`);
  const placeOut = { ...place, bodies: [] };
  for (const body of place.bodies) {
    const queries = [
      `${place.label} ${body} meeting agenda`,
      `${place.label} ${body} agendas and minutes 2026`,
    ];
    const seen = new Map();
    for (const q of queries) {
      try {
        const s = await tavily("search", { query: q, search_depth: "basic", max_results: 10, country: "united states" });
        credits += s.usage?.credits ?? 1;
        for (const r of s.results) {
          if (!seen.has(r.url)) seen.set(r.url, { url: r.url, title: r.title, score: r.score, ...classify(r.url) });
        }
      } catch (e) {
        console.log("  search error:", String(e));
      }
    }
    const results = [...seen.values()];
    const official = results
      .filter((r) => r.official)
      .map((r) => ({ ...r, agendaish: /agenda|minutes|meeting|board/i.test(r.url + " " + r.title) }))
      .sort((a, b) => Number(b.agendaish) - Number(a.agendaish) || Number(!!b.platform) - Number(!!a.platform) || b.score - a.score);

    const bodyOut = { body, resultCount: results.length, officialCount: official.length,
      officialHosts: [...new Set(official.map((r) => r.host))], platforms: [...new Set(official.map((r) => r.platform).filter(Boolean))],
      L1: official.length > 0, L2: false, L3: false, candidate: null, docLinks: 0, recentDates: [] };

    // Extract the top two official candidates in one call (still 1 credit for up to 5 URLs).
    const picks = official.slice(0, 2).map((r) => r.url);
    if (picks.length) {
      try {
        const x = await tavily("extract", { urls: picks, extract_depth: "basic", format: "markdown" });
        credits += x.usage?.credits ?? 1;
        for (const page of x.results ?? []) {
          const text = page.raw_content ?? "";
          writeFileSync(`research/step1/raw/${place.id}-${bodyOut.body.replace(/\W+/g, "-")}-${picks.indexOf(page.url)}.md`, `<!-- ${page.url} -->\n${text}`);
          const links = [...text.matchAll(DOC_LINK)].length;
          const recent = datesIn(text).filter((d) => d >= recentFrom && d <= upcomingTo);
          if (links > bodyOut.docLinks) { bodyOut.docLinks = links; bodyOut.candidate = page.url; }
          if (recent.length) bodyOut.recentDates.push(...recent.map((d) => d.toISOString().slice(0, 10)));
        }
        bodyOut.recentDates = [...new Set(bodyOut.recentDates)].sort().slice(-6);
        bodyOut.L2 = bodyOut.docLinks > 0;
        bodyOut.L3 = bodyOut.L2 && bodyOut.recentDates.length > 0;
        bodyOut.failedExtract = (x.failed_results ?? []).map((f) => f.url);
      } catch (e) {
        console.log("  extract error:", String(e));
      }
    }
    if (!bodyOut.candidate) bodyOut.candidate = official[0]?.url ?? null;
    console.log(`  ${body}: ${results.length} results, ${official.length} official ${JSON.stringify(bodyOut.platforms)} | L1 ${bodyOut.L1} L2 ${bodyOut.L2} (${bodyOut.docLinks} doc links) L3 ${bodyOut.L3} ${bodyOut.recentDates.join(",")}`);
    console.log(`    candidate: ${bodyOut.candidate}`);
    placeOut.bodies.push(bodyOut);
  }
  report.places.push(placeOut);
}

const allBodies = report.places.flatMap((p) => p.bodies);
const rate = (k) => `${allBodies.filter((b) => b[k]).length}/${allBodies.length}`;
report.summary = { credits, L1: rate("L1"), L2: rate("L2"), L3: rate("L3") };
console.log(`\nSummary: L1 ${rate("L1")}  L2 ${rate("L2")}  L3 ${rate("L3")}  credits used ~${credits}`);
writeFileSync("research/step1/discovery-report.json", JSON.stringify(report, null, 2));
console.log("Saved research/step1/discovery-report.json");

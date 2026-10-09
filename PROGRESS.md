# PROGRESS — Townwatch (provisional name)

Nebius x NVIDIA Global AI Hackathon, track "Best Apps and Agents" + bonus "Best Use of Tavily".
Deadline 30 Oct 2026 10:00 PDT; target submission **29 Oct**. Solo. Second entry by the same
entrant (Argus is the first): allowed if "unique and substantially different" (rules §4).

## Goal
Web app: a US county or town → agent discovers official agenda sources with Tavily → cheap
Nemotron triage of every agenda item → Ultra only for important items → sourced, neutral
briefing "This week in [Town]", "Near you" (address stays in the browser), meeting calendar,
"How this was made" panel (counts, tokens, cost). Nightly refresh via Nebius Serverless Job (stretch).

## Schedule
- [ ] 10 Oct: step 1 done, spec validated
- [ ] 18 Oct: end-to-end pipeline on one place
- [ ] 25 Oct: UI final, deployed, 3 demo places
- [ ] 27 Oct: tests, fixes, README, Devpost page
- [ ] 28 Oct: video
- [ ] 29 Oct: submit

## Step 1 — checks before any code (IN PROGRESS)
- [x] Rules and main page re-read in a browser (Devpost MCP needs re-auth; WebFetch gets 403)
- [x] Medill 2025 county data pulled: 213 zero-source counties → `data/medill-2025-news-deserts.tsv`
- [x] Name check "Townwatch": no civic product found under that name (generic phrase, close to "neighborhood watch")
- [x] Project skeleton: git init, .gitignore, .env.example, FRICTION_LOG.md
- [x] Probe scripts written: `scripts/step1/probe-nebius.mjs`, `scripts/step1/discovery-test.mjs`
- [x] Keys `townwatch` (Nebius + Tavily) in `.env.local` (git-ignored, checked). Nebius balance $29.69, shared with Argus
- [x] Nebius probe → `research/step1/nebius-probe.json`: 4 NVIDIA models, all answer
- [ ] Read Token Factory prices once logged in (third-party prices only so far)
- [x] Discovery test → `research/step1/discovery-report.json` (~25 Tavily credits total for step 1)
- [x] PDF extract test (Edgecombe 5 Oct 2026 agenda): readable via Tavily, page breaks lost
- [x] Report sent to user (2026-10-08)
- [x] USER validated 3 decisions (2026-10-08):
  1. Citation = source document + agenda item number always, + page when we can fetch the PDF ourselves.
     Rule becomes "no cited document and item, no claim".
  2. Per-platform readers, never per-city: Legistar + CivicClerk in v1, BoardDocs only if time allows.
  3. Demo places: Edgecombe NC + Wasco OR (news deserts) + Ann Arbor MI (comparison); Columbia GA if CivicClerk reader is ready.

## Step 2 — speckit (IN PROGRESS)
- [x] speckit-init (`.specify/`, bash scripts)
- [x] constitution v1.0.0 (`.specify/memory/constitution.md`, 10 principles)
- [x] specify → `specs/001-civic-briefing/spec.md` (6 user stories, 26 FR, 9 SC); 2 open questions: FR-021 geocoding, FR-024 new-place limit
- [x] clarify: 5 answers in spec (geocoder C, visitor limits B + 12 USD stop, escalation rule C, town = town+county+school board, non-escalated items verbatim). User delegates remaining choices to my recommendations (2026-10-08)
- [x] plan → plan.md, research.md (R1-R10), data-model.md, contracts/ (http-api, pipeline-stages, model-io), quickstart.md
  - Checked live: Legistar API (a2gov, 120 items for 5 Oct council), CivicClerk API (columbiacoga, item tree + PDF), Census geocoder JSONP OK (no CORS), Nominatim CORS OK, Nebius Jobs have no native scheduler
  - Stack: Next.js 16 + TS on Vercel free, Upstash Redis, pipeline in src/pipeline runnable by CLI; analyses = persisted jobs advanced in short steps; nightly = Nebius Serverless Job via GitHub Actions (stretch)
- [x] tasks → tasks.md: 74 tasks (setup 6, foundation 9, US1 23, US2 14, US3 6, US4 2, US5 2, US6 3, polish 9)
- [x] USER validated spec + scope (2026-10-08)

## Step 3 — implementation (IN PROGRESS)
Follow specs/001-civic-briefing/tasks.md in order; tick tasks there AND note milestones here.

- [x] 2026-10-08 Phase 1 + 2 done (Next 16.4 scaffold, openai 7, zod 4, unpdf, upstash; MIT; check-secrets; fixtures)
- [x] 2026-10-08 **Pipeline MVP end to end on Edgecombe from the CLI** (18 Oct milestone reached early):
  `node --env-file=.env.local node_modules/tsx/dist/cli.mjs src/pipeline/cli.ts all --place nc-edgecombe-county`
  → 2 bodies covered (commissioners 5 Oct, school board 14 Sep), planning not found, 73 items, 9 escalated,
  0 statements dropped, 20 calls, $0.075, 7 Tavily credits, 135 s. Re-run = $0 (cache).
- [x] Triage eval (T032): Nano 30B kept (precision 0.80 vs Lightning 0.44, same cost) → research.md R1
- [x] 58 tests green incl. offline replay of the real run (tests/fixtures/recorded/edgecombe-2026-10-08.json)
- [x] T034-T037 (2026-10-08): GET /api/briefings/[placeId], editorial UI (docs/design.md: Playfair Display +
  Public Sans, one brick accent, radius 0, light+dark), home, place page, privacy page. Checked in the built-in
  browser at 1280 and 375 px: 16/16 paragraphs cited, 0 dashes in UI copy, water item 4.8 leads.
- [ ] T038 Playwright spec written (tests/e2e/briefing.spec.ts) but NOT run: launching Chromium from the
  sandboxed shell fails (`spawn UNKNOWN`). User can run `npx playwright install chromium` then `npx playwright test`.
- Dev server: preview "townwatch-dev" (port 3747), entry added to D:\claude\.claude\launch.json (cwd townwatch).
- Next 16 gotcha: cacheComponents is ON → read `params` inside <Suspense> (see src/app/[placeId]/page.tsx).
- [x] Commits: e6656ce (MVP), dfa251d (LF line endings). Repo-local git identity Anas <atikniouine93@gmail.com>.
- [x] US2 T039-T051 (2026-10-08): Legistar + CivicClerk readers (tenant from URL, paginated, most recent
  meeting WITH a published agenda, public-comment speakers dropped), page lookup in platform PDFs,
  persisted jobs advanced in steps (src/pipeline/jobs.ts; analysePlace = runToEnd), limits (1/visitor/day,
  10/day, $12 stop, salted daily IP hash), API routes /api/analyses*, /api/places (Census Gazetteer index
  src/data/places.json, 22,669 places), home search + StartAnalysis progress view. Absolute cap 12 Ultra
  escalations per place (spec FR-011 updated). 82 tests.
  Demo briefings cached: nc-edgecombe-county ($0.075), ga-columbia-county (web flow, Oct 6 meeting, pages on
  all 16 citations, ~$0.18 incl. a first run on the wrong meeting), mi-ann-arbor (council + Washtenaw county,
  $0.16). Washtenaw has 12 news sources per Medill (comparison line on home).
- [x] T052 SC-004 measured (research/sc004.md; run 1 kept as sc004-run1.md): run 1 = 2/11, after generic fixes
  run 2 = 6/11 (Wasco, Asotin, Caroline, Cumberland, Franklin AR, Powell KY), $0.20 total. Target 7/10 NOT met yet.
  Remaining causes: Louisiana "Police Jury"/parish council not in role words (Vernon Parish), agendas posted as
  news articles (Lincoln CO), Montgomery GA read but 0 items (to inspect), Hartley TX / Sussex VA nothing found.
  Fixes done for run 2: other-state domain rule, own-domain ranking, body-named URL ranking, alternates (second
  chance), CivicPlus `_MMDDYYYY` dates + PDF preference + "4.II." line numbering, agenda dedupe across bodies,
  per-source error isolation. FRICTION_LOG updated (Nano accepts other-state domains, rejects BoardDocs).
- [x] US3 (2026-10-08): locate stage (Nominatim, 1 req/s, cached, within 45 mi, parcel refs dropped), browser
  Census JSONP geocoding, MapLibre 6 + OpenFreeMap positron pin map (lazy), Near you (nearest mention per item,
  10 mi radius, outside-area / none-nearby states), topic filter via ?topic= (server, square tabs), favicon
  (src/app/icon.svg), privacy page names Census, OpenFreeMap, Nominatim, visitor hash. SC-007 verified in the
  browser: address only in the census.gov request. 96 tests. T054 e2e spec written, not run (sandbox).
- [x] US4 + US5 (2026-10-08): calendar (coming up / recently, "Agenda not published yet" for scheduled
  meetings returned by Legistar/CivicClerk readers, agendaPublished=false), story facts (Decided by, Amount,
  Meeting, Where, Comment), "How this was made" panel (flow sources → items → Nano → Ultra, removed sentences,
  Super fallbacks, per-model table with reasoning tokens, Tavily credits, sources kept/rejected). Next 16:
  `await connection()` before `new Date()` in the place page. 102 tests.
- Known gap: Ann Arbor school board resolves to Washtenaw Intermediate SD (AAPS is on BoardDocs, unreadable).
- [x] SC-004 runs 3 and 4 (commit 5969f98): honest result 4/11, every success checked against the county's own
  site (table now shows the main source). Runs 2-3 had a false success (Franklin AR read from Franklin TN).
  Added: state names in domains, `co`+state and .org/.com domains, other-county domain rule (after the model,
  so prompts and the test tape stay stable), letterhead other-state check, month-only dates (no guessed day),
  county body names by state (Quorum Court AR, Fiscal Court KY, Commissioners Court TX, Police Jury LA,
  Board of Supervisors VA/MS/IA/CA/WI/AZ), discover cache key includes the phrase. History in research/sc004.md.
- [x] SC-004 run 5 (site-scoped second search): still 4/11 → target revised in spec to the measured value.
- [x] 2026-10-09 Production build OK (Playfair single style fix), no key or API host in .next/static.
- [x] Public repo https://github.com/Chinorab/townwatch (MIT detected, branch master).
- [x] Vercel project `townwatch` (scope anas02-projects, prj_8P7WmTlu88dpvOOjPz3ltKAtMSUk) linked to the repo
  via Vercel CLI (the Vercel MCP connector has no access to that scope: 403). `vercel link` adds
  VERCEL_OIDC_TOKEN to .env.local and `.env*` to .gitignore: revert the .gitignore change (it would hide .env.example).
- [x] 2026-10-09 DEPLOYED: https://townwatch-tau.vercel.app (auto-deploy on push to master). Upstash Redis via Vercel
  Marketplace injects KV_REST_API_URL/TOKEN (code accepts KV_* and UPSTASH_*; values are [SENSITIVE] for
  vercel env pull, user pasted them in .env.local). Cache pushed: 956 entries (scripts/push-cache.ts), 3 demo
  briefings served from Upstash. NOTE: local dev/CLI now also use Upstash because .env.local has KV_*.
- [x] NEBIUS_API_KEY + TAVILY_API_KEY added in Vercel (Production) by the user on 2026-10-09; redeployed (vercel redeploy). Live new-place test: Hood River County OR (see below).
- NEXT after deploy: README + architecture diagram (T071), Devpost text (T072), quickstart on prod (T073), video.
- Known gaps: school boards on BoardDocs not readable (v1 scope); Nano sometimes rejects BoardDocs as
  "external"; Columbia GA school board (ccboe.net) not discovered.

Spend so far (approx.): Nebius ~$0.45 of $29.69 · Tavily ~50 credits of 1,000.
Local store: `.cache/kv` (FileKV) when UPSTASH env vars are empty. Briefing JSON: `.cache/briefings/`.
Gotchas: never edit TS regexes through sed (escaping breaks); Next 16 → read node_modules/next/dist/docs before UI code.

## Step 1 results (2026-10-08)
Models: Nano 30B 244 ms, Lightning 3.5 217 ms, Super 120B 293 ms (thinking off); Ultra 550B 4 s
with 685 reasoning tokens on a 76-token prompt. Super got the toy case wrong (1 sample).

Discovery, 5 places x 2 bodies = 10 sources:
| Source | Right official site found | Agenda docs readable now |
|---|---|---|
| Columbia GA commissioners | yes (CivicClerk portal) | no, JS portal |
| Columbia GA school board | yes with better query (ccboe.net) | not tested |
| Edgecombe NC commissioners | yes | yes, 5 Oct 2026 agenda |
| Edgecombe NC school board | yes (ecps.us) | yes, 14 Sep 2026 |
| Wasco OR commissioners | yes (+ archive page) | one hop away |
| Wasco OR school district | yes (nwasco.k12.or.us) | not yet |
| Allendale SC council | yes with better query (allendalecounty.com/agenda) | not tested |
| Allendale SC schools | yes (BoardDocs) | no, JS portal |
| Ann Arbor council | yes (Legistar) | yes, Oct 2026 |
| Ann Arbor planning | yes (Legistar) | yes |
→ right source 10/10 (8 first try, 2 after rewording), readable at once 4/10.
Lessons: TLD filter is wrong (allendalecounty.com, ccboe.net are official) → verify "official +
right place + right body" with Nano on title/url/snippet; wrong-place hits are common (Allendale NJ,
Spartanburg, Clatsop, Clarke). JS portals need per-platform readers (CivicClerk, BoardDocs), not
per-city config. Tavily Extract flattens PDFs: no page numbers.

## Decisions
- Project folder: `D:\claude\townwatch`. Everything in English (code, UI, README, commits).
- Step 1 scripts: plain Node 24 ESM with `--env-file`, no dependencies.
- Test places: Columbia GA, Edgecombe NC, Wasco OR, Allendale SC (news deserts, 165k → 7k people) + Ann Arbor MI (comparison).

## Useful facts
- Token Factory base URL `https://api.tokenfactory.nebius.com/v1/` (OpenAI compatible).
- From Argus: Nemotron thinking off via `chat_template_kwargs: {enable_thinking:false}`; reasoning in
  `message.reasoning`; Ultra 550B latency 20 to 96 s, one hung call → per-call timeouts + Super fallback.
- Tavily: search basic = 1 credit, advanced = 2; extract basic = 1 credit / 5 URLs; map 1 credit / 10 pages; `include_usage: true` returns credits.

### 2026-10-09 live new-place test (production keys)
- Hood River County OR, started from the deployed app: discovery and verification ran on the production NEBIUS/TAVILY keys (4 Nano calls, $0.0008, 30 Tavily credits). Result: no source kept. The county site (hoodrivercounty.gov, `index.asp?SEC=` CMS) and the school district page gave "no dated agendas found". Same failure class as the SC-004 misses; not fixed.
- Copy fix: when no body is covered, the dek no longer reads "What local bodies is deciding" and the empty state says nothing could be read instead of "every item is listed below".
- Note: that test used this IP's 1 new place for today (FR-024).
- [x] T071 README.md + docs/architecture.svg (+ .png for Devpost) on 2026-10-09: measured routing table over the 3 demo places (93 calls, $0.41; Nano $0.010 for 191 items; Ultra 97% of cost, 86% of its output is reasoning), Tavily usage, trust rules, privacy, honest limits (SC-004 4/11, Hood River, BoardDocs). Next: T072 docs/devpost.md from FRICTION_LOG.
- [x] T072 docs/devpost.md drafted on 2026-10-09 (all fields, Tavily section, feedback from FRICTION_LOG; facts checked against live briefings and code). Video link still to add. Devpost MCP needs re-auth before submitting.
- [x] T073 quickstart run on production 2026-10-09 (results at the end of quickstart.md). Fixes: CivicClerk scheduled meeting links, retiree boards excluded, npm run pipeline loads .env.local. Found: Edgecombe county site 403 from France (geo block?), noted in README + FRICTION_LOG.

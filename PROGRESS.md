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
- [ ] T052 SC-004 running: scripts/sc004.ts → research/sc004.md (Wasco + 10 sampled counties).
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

---
description: "Task list for Townwatch civic briefing"
---

# Tasks: Townwatch civic briefing

**Input**: Design documents from `/specs/001-civic-briefing/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Required by constitution principle X (pipeline stages, routing, citation rule). Test
tasks come before the implementation they cover.

**Organization**: grouped by user story; each story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1 to US6 from spec.md

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Initialise a Next.js 16 + TypeScript project at the repo root (App Router, `src/` dir, no Tailwind default theme colours kept), keep `scripts/step1/`, update `package.json` scripts: `dev`, `build`, `test`, `pipeline` (tsx `src/pipeline/cli.ts`), `check:secrets`
- [X] T002 [P] Add dependencies in package.json: `openai`, `zod`, `unpdf`, `@upstash/redis`, `@vercel/functions`; dev: `vitest`, `tsx`, `@playwright/test`, `eslint`
- [X] T003 [P] Configure Vitest with `tests/` root and a network guard that fails any test making a real HTTP call in vitest.config.ts and tests/setup.ts
- [X] T004 [P] Extend .env.example with `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `CRON_SECRET`, `MODEL_TRIAGE`, `MODEL_EXPLAIN`, `MODEL_FALLBACK` (no values)
- [X] T005 [P] Write scripts/check-secrets.mjs: scan the repo (excluding node_modules and .env.local) and `.next/static` for `tvly-`, Nebius key patterns and `UPSTASH_REDIS_REST_TOKEN` values; exit 1 on any hit
- [X] T006 [P] Add MIT LICENSE file at repo root (copyright 2026 Chinorab)

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ No user story work before this phase is complete**

- [X] T007 Define zod schemas and TS types for Place, BodyRef, Source, Document, Meeting, AgendaItem, Triage, Routing, Explanation, Statement, Citation, ModelCall, Analysis, Briefing per data-model.md in src/lib/schemas.ts
- [X] T008 [P] Implement the price table (per-model input/output USD per M tokens, labelled estimate, Lightning marked unknown) in src/lib/prices.ts
- [X] T009 Implement the Token Factory client in src/lib/models.ts: OpenAI SDK with `NEBIUS_BASE_URL`, model ids from env with catalogue defaults, `thinking: off` via `chat_template_kwargs`, per-model timeouts (fast 60 s, Ultra 150 s, Super 120 s), Ultra→Super fallback on timeout or 5xx, JSON extraction tolerant of reasoning text, `ModelCall` record with input/output/reasoning tokens (reasoning may be absent), latency and cost from prices.ts
- [X] T010 [P] Implement the Tavily client (search, extract, map; `include_usage`; 90 s timeout; credit counting) in src/lib/tavily.ts
- [X] T011 [P] Implement the store in src/lib/store.ts: Upstash Redis wrapper with get/set JSON, gzip text blobs, content-hash helpers, counters with TTL, ledger add/read, short locks (SET NX PX); an in-memory implementation for tests and CLI `--offline`
- [X] T012 [P] Unit tests for models.ts (fallback on timeout, usage shapes with and without `completion_tokens_details`, cost maths) in tests/unit/models.test.ts
- [X] T013 [P] Capture real fixtures with source URL and retrieval date in tests/fixtures/: Edgecombe 5 Oct 2026 agenda text (Tavily extract, already in research/step1/raw), Edgecombe agendas listing page, Ann Arbor Legistar events + eventitems for event 14160, Columbia CivicClerk events + meeting 3463 + plain-text agenda file 13850
- [X] T014 Implement the pipeline context (injected clients: models, tavily, fetcher, store; analysis id; call recorder) in src/pipeline/context.ts
- [X] T015 Implement the CLI entry (`npm run pipeline -- <stage|all> --place <id> [--offline] [--from-cache]`) printing stage output and cost summary in src/pipeline/cli.ts

**Checkpoint**: clients, store, schemas and CLI ready.

---

## Phase 3: User Story 1 - Read the briefing for my place (Priority: P1) 🎯 MVP

**Goal**: a cited, neutral briefing for Edgecombe County, NC, produced by the full pipeline and
displayed on a place page.

**Independent Test**: `npm run pipeline -- all --place nc-edgecombe-county`, then open
`/nc-edgecombe-county`: briefing renders from cache, every statement links to the official
document with its item number, item 4.8 is explained neutrally, nothing uncited is shown.

### Tests for User Story 1

- [X] T016 [P] [US1] Routing tests for the FR-011 rule (routine, info only, low impact, topic match, 25% cap with ordering) in tests/unit/route.test.ts
- [X] T017 [P] [US1] Grounding tests: quote not in source → statement dropped; number or date not in source → field becomes "not stated in the record"; opinion words → dropped and counted in tests/unit/ground.test.ts
- [X] T018 [P] [US1] Splitter tests on the Edgecombe 5 Oct 2026 fixture (items 1.1 to 4.9 with verbatim numbers and titles) in tests/unit/split.test.ts
- [X] T019 [P] [US1] Generic reader tests: relative link resolution against the listing URL, document kind detection, direct fetch 403 → Tavily Extract fallback with `pages: null` in tests/unit/generic-reader.test.ts
- [X] T020 [P] [US1] Pipeline test on fixtures with recorded model replies: Edgecombe discover→assemble produces a Briefing whose every Statement has a Citation in tests/pipeline/edgecombe.test.ts

### Implementation for User Story 1

- [X] T021 [P] [US1] Implement `discover` (two basic searches per body, phrasing from research R2, exclusion list for social/news/aggregators, dedup) in src/pipeline/stages/discover.ts
- [X] T022 [P] [US1] Implement `verify` (one fast-model call per body on up to 6 candidates, schema-validated, accept only official+rightPlace+rightBody, keep rejected with reason) in src/pipeline/stages/verify.ts
- [X] T023 [P] [US1] Implement the generic reader (Tavily Extract of the listing, link resolution, window filter 14 days back / 21 ahead, Tavily Map one hop when no documents, direct download + unpdf per page, Extract fallback) in src/pipeline/readers/generic.ts
- [X] T024 [US1] Implement `list` and `read` stages dispatching to readers by platform in src/pipeline/stages/list.ts and src/pipeline/stages/read.ts
- [X] T025 [P] [US1] Implement `split` (numbering patterns `4.8.`, `A.`, `1)`, `IV.`, heading hierarchy, page mapping when known) in src/pipeline/stages/split.ts
- [X] T026 [P] [US1] Implement `triage` (batches of 10, item text truncated to 1,500 chars, prompt listing enum values, zod validation, one retry on invalid JSON) in src/pipeline/stages/triage.ts
- [X] T027 [P] [US1] Implement `route` exactly as contracts/pipeline-stages.md in src/pipeline/stages/route.ts
- [X] T028 [P] [US1] Implement `explain` (Ultra, one item per call, up to 4 in parallel, neutral plain-English prompt per contracts/model-io.md, Super fallback) in src/pipeline/stages/explain.ts
- [X] T029 [P] [US1] Implement `ground` (quote match with normalised whitespace and case, number/date/amount check, opinion word list, "not stated in the record" substitution, dropped counts) in src/pipeline/stages/ground.ts
- [X] T030 [US1] Implement `assemble` (window, headline items by importance, "Also on the agenda" verbatim list, meetings, located items, panel totals) in src/pipeline/stages/assemble.ts
- [X] T031 [US1] Wire `all` in src/pipeline/run.ts with content-hash caching at every stage (no repeat call for a cached doc/item/model)
- [X] T032 [US1] Triage model eval: hand-label about 60 real items from the three fixtures (topic, routine, decisionExpected, impact) in tests/fixtures/triage-labels.json, run Nano vs Lightning with scripts/eval-triage.ts, record accuracy, latency, cost in research.md, set `MODEL_TRIAGE`
- [X] T033 [US1] Run the real pipeline on Edgecombe, review the briefing by hand against the 5 Oct 2026 agenda (SC-002), log frictions in FRICTION_LOG.md
- [X] T034 [US1] Implement `GET /api/briefings/[placeId]` (cache only, 404 not_analysed) in src/app/api/briefings/[placeId]/route.ts
- [X] T035 [US1] Load design skills (design-taste-frontend, web-design-guidelines, design-md-library, image-to-code), write the editorial design tokens and type scale in src/app/globals.css and docs/design.md
- [X] T036 [US1] Build the place page: masthead "This week in [Place]", headline items with statements and inline citations (document link, item number, page), "Also on the agenda", disclaimer, last analysed date, in src/app/[placeId]/page.tsx and src/components/briefing/
- [X] T037 [P] [US1] Build the home page with place search (static list of demo places for now) in src/app/page.tsx
- [ ] T038 [US1] Playwright check of the place page (citations open the right URL, no uncited statement, disclaimer visible, mobile and desktop screenshots) in tests/e2e/briefing.spec.ts

**Checkpoint**: MVP: Edgecombe briefing end to end (target 18 Oct for the pipeline, UI by 22 Oct).

---

## Phase 4: User Story 2 - Analyse a place nobody has analysed yet (Priority: P2)

**Goal**: any US county or town analysed live with no configuration, within visitor and budget
limits; Legistar and CivicClerk portals covered.

**Independent Test**: start an analysis for an unanalysed news-desert county from the UI;
progress shows by stage; briefing appears; wrong-place sources are listed as rejected; a second
new place the same day is refused politely.

### Tests for User Story 2

- [X] T039 [P] [US2] Legistar reader tests on the Ann Arbor fixture (client from URL, events in window, numbered items) in tests/unit/legistar.test.ts
- [X] T040 [P] [US2] CivicClerk reader tests on the Columbia fixture (tenant from URL, events, nested item tree flattened with outline numbers, PDF and plain-text file URLs) in tests/unit/civicclerk.test.ts
- [X] T041 [P] [US2] Job state machine tests (stage transitions, lock contention returns 409, failed body does not fail analysis, resume after interruption) in tests/unit/jobs.test.ts
- [X] T042 [P] [US2] Limits tests (visitor 1/day with salted hash, global 10/day, 12 USD ledger stop, cached places still served) in tests/unit/limits.test.ts

### Implementation for User Story 2

- [X] T043 [P] [US2] Implement the Legistar reader (webapi.legistar.com/v1/{client}/events and eventitems, agenda file URL as citation target) in src/pipeline/readers/legistar.ts
- [X] T044 [P] [US2] Implement the CivicClerk reader ({tenant}.api.civicclerk.com/v1 Events, Meetings/{agendaId}, GetMeetingFileStream PDF parsed per page) in src/pipeline/readers/civicclerk.ts
- [X] T045 [US2] Add platform detection by URL pattern (legistar, civicclerk, boarddocs → `unreadable` with portal link, generic) in src/pipeline/readers/index.ts
- [X] T046 [US2] Implement the analysis job state machine and `advance()` (one bounded unit per call, lock TTL 330 s, progress counters) in src/pipeline/jobs.ts
- [X] T047 [US2] Implement limits and ledger (daily salt, visitor hash, counters, budget stop) in src/lib/limits.ts
- [X] T048 [US2] Implement `POST /api/analyses`, `GET /api/analyses/[id]`, `POST /api/analyses/[id]/advance` per contracts/http-api.md with `maxDuration` set in src/app/api/analyses/
- [X] T049 [US2] Implement `GET /api/places?q=` with state disambiguation from a US counties and places list in src/data/ and src/app/api/places/route.ts
- [X] T050 [US2] Build the progress view (stages, live counts, bodies covered or not with portal links, limit messages) in src/components/progress/ and wire it in src/app/[placeId]/page.tsx
- [X] T051 [US2] Run real analyses for Ann Arbor MI and Columbia County GA, review briefings by hand, log frictions in FRICTION_LOG.md
- [ ] T052 [US2] Measure SC-004: run discovery to briefing on 10 counties sampled from data/medill-2025-news-deserts.tsv, record success, time and cost per county in research/sc004.md (respect the budget: stop if average cost > 0.25 USD)

**Checkpoint**: live analysis works; 4 demo places cached.

---

## Phase 5: User Story 3 - See what is near me and what matters to me (Priority: P2)

**Goal**: "Near you" ranked by distance, computed in the browser; topic filters.

**Independent Test**: on Edgecombe, enter a Tarboro address: located items are ordered by
distance; network inspection shows the address only in the Census JSONP request.

### Tests for User Story 3

- [X] T053 [P] [US3] Distance and ranking tests (haversine, outside-area case, no nearby items) in tests/unit/near.test.ts
- [ ] T054 [P] [US3] Playwright privacy check: enter an address, assert no request to the app origin contains any part of it, in tests/e2e/privacy.spec.ts

### Implementation for User Story 3

- [X] T055 [P] [US3] Implement `locate` (Census for street addresses, Nominatim for roads and landmarks, 1 req/s, contact user agent, cached per text) in src/pipeline/stages/locate.ts and add it to src/pipeline/run.ts
- [X] T056 [P] [US3] Implement browser geocoding by JSONP to the Census geocoder in src/client/geocode.ts
- [X] T057 [P] [US3] Implement the drop-a-pin map (MapLibre GL, OpenFreeMap tiles, no key) in src/components/near/PinMap.tsx
- [X] T058 [US3] Build the "Near you" section and topic filters (state kept in the browser only, localStorage optional) in src/components/near/ and src/components/briefing/TopicFilter.tsx

---

## Phase 6: User Story 4 - Know when and how to take part (Priority: P3)

**Goal**: meeting calendar and "how to take part" details.

**Independent Test**: on a demo place, every upcoming meeting in the sources is listed with its
agenda link; missing time or room reads "not stated in the record".

- [X] T059 [P] [US4] Calendar tests (date order, missing fields) in tests/unit/calendar.test.ts
- [X] T060 [US4] Build the calendar section and per-item "How to take part" block from Explanation fields in src/components/calendar/ and src/components/briefing/TakePart.tsx

---

## Phase 7: User Story 5 - See how the briefing was made (Priority: P3)

**Goal**: the "How this was made" panel.

**Independent Test**: panel counts equal the briefing; cost equals the sum of recorded calls;
cached views say they cost nothing new.

- [X] T061 [P] [US5] Panel totals test (sum of ModelCall costs, counts per stage and model) in tests/unit/panel.test.ts
- [X] T062 [US5] Build the panel (sources kept and rejected with reasons, items triaged, escalated with reasons, tokens and cost per model, Tavily credits, analysis date, cache notice) in src/components/panel/HowThisWasMade.tsx

---

## Phase 8: User Story 6 - Followed places stay fresh (Priority: P4, stretch)

**Goal**: nightly refresh via a Nebius Serverless Job. Start only if Phases 1 to 7 are done by
25 Oct; otherwise document as next step in the README.

- [ ] T063 [US6] Implement `GET /api/cron/refresh` logic as a CLI command `npm run pipeline -- refresh` (new or changed documents only, no model call when nothing changed) in src/pipeline/refresh.ts
- [ ] T064 [US6] Write deploy/Dockerfile.refresh for the pipeline CLI and push the image to Nebius Container Registry
- [ ] T065 [US6] Write deploy/nightly.yml (GitHub Actions schedule running `nebius ai job create --image ... --env-secret ...` on a CPU preset) and test one run, log frictions in FRICTION_LOG.md

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T066 [P] Privacy page (address handling, Census geocoder, pin option, visitor counters, no accounts) in src/app/privacy/page.tsx
- [X] T067 [P] Favicon and app icon (no AI imagery) in src/app/icon.svg
- [ ] T068 [P] Copy pass on every UI string: no dashes, no emojis, no generic AI copy, no AI mentions, in src/components/ and src/app/
- [ ] T069 Accessibility and design audit with web-design-guidelines and Playwright (WCAG AA contrast, keyboard, focus, mobile) and fixes, in tests/e2e/a11y.spec.ts
- [X] T070 Deploy to Vercel with env vars and Upstash Redis, run `npm run check:secrets` on the build, pre-analyse the demo places in production
- [x] T071 [P] README: what it does, architecture diagram, how Nemotron and Token Factory are used (routing table with measured numbers), Tavily usage, Nebius tools, setup, tests, limits, in README.md and docs/architecture.svg
- [x] T072 [P] Devpost text and feedback section drafted from FRICTION_LOG.md in docs/devpost.md
- [x] T073 Run quickstart.md end to end on production and fix any gap
- [ ] T074 Make the GitHub repo public with MIT visible in the About section; record the video (under 3 min) and publish on YouTube

---

## Dependencies & Execution Order

- Phase 1 → Phase 2 → US1 (MVP). US2 depends on US1 stages (verify, read, triage, explain).
- US3, US4, US5 depend only on the Briefing produced by US1; they can run in any order after
  US1, and in parallel with US2.
- US6 depends on US2 (jobs) and is optional.
- Polish after the stories you ship; T070 (deploy) no later than 25 Oct.

## Parallel Opportunities

- Setup: T002 to T006 in parallel.
- Foundational: T008, T010, T011, T012, T013 in parallel after T007.
- US1 tests T016 to T020 in parallel; stages T021, T022, T023, T025, T026, T027, T028, T029 in
  parallel (separate files), then T024, T030, T031.
- US2: T039 to T042 in parallel; T043 and T044 in parallel.
- US3: T055, T056, T057 in parallel.

## Implementation Strategy

1. MVP first: Phases 1, 2, 3 → Edgecombe briefing from the CLI by 18 Oct, page by 22 Oct.
2. Add US2 readers and jobs → Ann Arbor and Columbia cached, live analysis by 23 Oct.
3. Add US3, US4, US5 (UI sections on data already produced) by 25 Oct, deploy the same day.
4. Polish, README, video 26 to 28 Oct. US6 only if ahead of schedule.
5. Budget check after each real run: stop and report if spend trends above 20 USD.

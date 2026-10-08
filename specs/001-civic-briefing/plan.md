# Implementation Plan: Townwatch civic briefing

**Branch**: `001-civic-briefing` | **Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-civic-briefing/spec.md`

## Summary

A Next.js web app that turns official US local agendas into a cited, neutral briefing. A
staged pipeline finds sources with Tavily, verifies them with a fast Nemotron model, reads
agendas through three readers (Legistar API, CivicClerk API, generic pages and PDFs with Tavily
Extract as fallback), splits them deterministically into numbered items, triages items in
batches with Nemotron Nano or Lightning, escalates by an explicit rule (max 25%) to Nemotron 3
Ultra, then validates every statement against the source text before display. Long analyses run
as persisted jobs advanced in short steps. Everything is cached by content hash; every model
call is metered for the "How this was made" panel. See [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript 5, Node 24

**Primary Dependencies**: Next.js 16 (App Router), OpenAI-compatible SDK pointed at Token
Factory, Tavily REST, zod, unpdf, @upstash/redis, MapLibre GL (client), Vitest, Playwright

**Storage**: Upstash Redis (Vercel Marketplace free tier): jobs, caches, counters, ledger

**Testing**: Vitest (unit and pipeline with recorded real fixtures), Playwright for UI checks

**Target Platform**: Vercel (free plan) for app and API; Nebius Serverless Job for the nightly
refresh (stretch), triggered by a GitHub Actions schedule

**Project Type**: web application (single Next.js project with a CLI-runnable pipeline)

**Performance Goals**: cached briefing visible under 2 s; new place under 5 min; each advance
step under 120 s

**Constraints**: Token Factory spend under 20 USD total, 12 USD safety stop in app; address
never reaches the server; secrets server-side only; free hosting until 15 Dec 2026

**Scale/Scope**: 3 to 4 demo places pre-analysed, up to 10 new places per day; about 6 screens
(home, place briefing, progress, panel, privacy, about)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How the plan complies | Status |
|---|---|---|
| I Source or silence | Citation object required on every Statement; ground stage drops uncited; non-escalated items shown verbatim only | Pass |
| II Neutrality | Prompt rules + word-list check in ground stage; dropped count in panel | Pass |
| III Nothing invented | Quote and number checks against source; missing fields forced to "not stated in the record" | Pass |
| IV Official sources | Model verification (official, place, body) on every candidate; news and social excluded | Pass |
| V Zero per-city config | Readers per platform only; tenant derived from URL; no city list in code (the county list is data for name lookup only) | Pass |
| VI Privacy | Census JSONP and pin drop in browser; distance computed client-side; hashed, salted, 24 h visitor counters | Pass |
| VII Frugal routing | Batched fast triage, deterministic rule, 25% cap, Ultra with timeout and Super fallback, content-hash cache, metered calls, ledger stop | Pass |
| VIII Secrets | Env vars on Vercel and Nebius SecretStash; `check:secrets` gate before deploy | Pass |
| IX Real data | Fixtures captured from real portals with URL and date; demo places real | Pass |
| X Testable stages | 11 stage functions with typed I/O, CLI per stage, tests on stages, routing, grounding | Pass |

Post-design re-check (after data-model and contracts): no violations; no complexity entries
needed.

## Project Structure

### Documentation (this feature)

```text
specs/001-civic-briefing/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   ├── pipeline-stages.md
│   └── model-io.md
└── tasks.md             # next: /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── app/                      # Next.js routes and pages
│   ├── page.tsx              # home: place search
│   ├── [placeId]/page.tsx    # briefing, Near you, calendar, panel
│   ├── privacy/page.tsx
│   └── api/
│       ├── places/route.ts
│       ├── briefings/[placeId]/route.ts
│       ├── analyses/route.ts
│       ├── analyses/[id]/route.ts
│       ├── analyses/[id]/advance/route.ts
│       └── cron/refresh/route.ts        # stretch
├── components/               # editorial UI (built with the design skills)
├── client/                   # browser-only: geocode (JSONP), distance, pin map
├── pipeline/
│   ├── stages/               # discover, verify, list, read, split, triage, route,
│   │                         # explain, ground, locate, assemble
│   ├── readers/              # legistar.ts, civicclerk.ts, generic.ts
│   ├── jobs.ts               # analysis state machine and advance()
│   └── cli.ts                # npm run pipeline
├── lib/
│   ├── models.ts             # Token Factory client, timeouts, fallback, cost meter
│   ├── prices.ts             # price table (estimates until read from console)
│   ├── tavily.ts
│   ├── store.ts              # Redis wrapper, caches, counters, ledger
│   └── schemas.ts            # zod schemas from data-model.md
└── data/                     # US county and place name lists (lookup only)

tests/
├── fixtures/                 # real captured documents and API responses
├── unit/                     # route, ground, split, readers, schemas
└── pipeline/                 # stage chains on fixtures with recorded model replies

deploy/
├── Dockerfile.refresh        # stretch: pipeline CLI image for Nebius Serverless Job
└── nightly.yml               # stretch: GitHub Actions schedule

scripts/step1/                # kept: step 1 probes
```

**Structure Decision**: one Next.js project. The pipeline lives in `src/pipeline` with no
dependency on Next.js, so the same code runs in API routes, in the CLI and in the nightly
container.

## Milestones mapped to the schedule

| Date | Deliverable |
|---|---|
| 18 Oct | Pipeline end to end from the CLI on Edgecombe (discover → briefing JSON), tests green, triage model chosen by eval |
| 21 Oct | Legistar and CivicClerk readers; Ann Arbor and Columbia briefings; jobs + advance API |
| 25 Oct | Editorial UI, Near you, calendar, panel, privacy page, favicon; deployed on Vercel; 3 to 4 demo places cached |
| 27 Oct | Tests, fixes, README with architecture diagram, MIT license, Devpost text, feedback from FRICTION_LOG |
| 28 Oct | Video |
| 29 Oct | Submit. Nightly Nebius Job only if done by 25 Oct; otherwise documented as next step |

## Complexity Tracking

No constitution violations to justify.

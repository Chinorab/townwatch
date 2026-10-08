# HTTP API contract

All endpoints are same-origin JSON. No endpoint accepts or returns a user address.
Errors: `{ "error": { "code": string, "message": string } }` with a matching HTTP status.

## GET /api/places?q={text}
Resolve a typed name to candidate places (county or town, with state) for disambiguation (FR-001).
Uses the static county list plus a Census places list; no model call, no Tavily call.
200 → `{ "candidates": [ { "placeId", "name", "kind", "state", "countyName?", "analysed": boolean } ] }`

## GET /api/briefings/{placeId}
Latest briefing from cache (FR-022, SC-003). No model call.
200 → Briefing (see data-model.md). 404 `not_analysed` when none exists.

## POST /api/analyses
Body `{ "placeId": string }`. Starts a new analysis, or returns the running one.
- 202 → `{ "analysisId", "status" }`
- 200 → `{ "analysisId", "status": "done" }` when a fresh briefing exists (no new spend)
- 429 `visitor_limit` (1 new place per visitor per day), `daily_limit` (10 per day),
  `budget_stop` (12 USD reached). The message names the analysed places instead (US2 scenario 4).

## GET /api/analyses/{analysisId}
200 → `{ "analysisId", "placeId", "status", "progress": {...}, "bodies": [ { "role", "name", "coverage" } ], "error?" }`

## POST /api/analyses/{analysisId}/advance
Runs the next bounded unit of work if no other advance holds the lock.
200 → same shape as GET. 409 `locked` when another step is running (client keeps polling).
Each call must finish well under the platform request cap (target < 120 s).

## GET /api/cron/refresh (stretch)
Protected by a bearer secret. Re-checks followed places, advances stale jobs. Used by the
nightly runner.

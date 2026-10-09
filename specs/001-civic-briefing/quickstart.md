# Quickstart: validate Townwatch end to end

## Prerequisites
- Node 24, npm.
- `.env.local` with `NEBIUS_API_KEY`, `TAVILY_API_KEY`, `UPSTASH_REDIS_REST_URL`,
  `UPSTASH_REDIS_REST_TOKEN` or the Vercel names `KV_REST_API_URL`, `KV_REST_API_TOKEN` (see `.env.example`). Never committed.

## 1. Unit and pipeline tests (no spend)
```bash
npm install
npm test
```
Expected: all stages pass on recorded fixtures; routing tests show the FR-011 rule (routine,
info only, rule match, 25% cap); grounding tests drop any statement whose quote or number is not
in the source; no test makes a network call.

## 2. One stage on a real place (small spend)
```bash
npm run pipeline -- discover --place nc-edgecombe-county
```
Expected: the Board of Commissioners source is `edgecombecountync.gov/residents/agendas.php`;
same-named places in other states are rejected with a reason.

## 3. Full analysis from the CLI
```bash
npm run pipeline -- all --place nc-edgecombe-county
```
Expected: meetings in the window (including 5 Oct 2026), items split with official numbers,
at most 25% escalated, item 4.8 (Rocky Mount water system resolution) explained with citations,
cost summary printed (target under 0.25 USD). Running it again costs 0 (all cached).

## 4. Web app
```bash
npm run dev
```
- Open the home page, choose "Edgecombe County, NC": briefing appears within 2 s (cached).
- Click any citation: the official PDF opens; item number shown.
- Enter an address in Tarboro: "Near you" lists located items by distance; in the browser
  network panel, no request to the app contains the address (only the Census JSONP call does).
- Open "How this was made": counts equal the briefing; cost equals the sum of calls.
- Choose a place not analysed: live progress by stage, then the briefing; a second new place
  the same day is refused with the visitor limit message.

## 5. Platform readers
```bash
npm run pipeline -- read --place mi-ann-arbor
npm run pipeline -- read --place ga-columbia-county
```
Expected: Ann Arbor meetings via Legistar API, Columbia County via CivicClerk API, both with
numbered items and no Tavily Extract call for them.

## 6. Pre-deploy gate
```bash
npm run check:secrets
```
Expected: no key pattern in the repo, the build output or client bundles.

## Run on production (T073, 2026-10-09)
- 1: 114 tests pass, lint and typecheck clean.
- 2: `discover` on Edgecombe returns `edgecombecountync.gov/residents/agendas.php` (cached, $0); other states rejected with a reason (`edgefield.k12.sc.us`: domain of another state).
- 3: not re-run on purpose: with Upstash credentials in `.env.local` it would rewrite the production demo briefing with a new window. The live new-place run (Hood River County, OR) covered the full chain on production.
- 4: home 0.3 s, Edgecombe 0.4 s (cached). Near you with a Tarboro address ranks 2 items; the only request carrying the address goes to geocoding.geo.census.gov. Panel totals equal the sum per model ($0.0756). Second new place the same day: 429 `visitor_limit` with the message. Cited documents: 4 of 5 open; the Edgecombe County site answers 403 to every visitor tested from France (whole site, also in a browser), so it may block visitors outside the US.
- 5: Ann Arbor via Legistar and Washtenaw / Columbia via CivicClerk, items numbered as on the portal. Two fixes: a scheduled CivicClerk meeting now links to its own event page, and retiree benefit boards no longer count as the city council.
- 6: secret scan passes on the repo and on the 13 JavaScript and CSS files served by production.

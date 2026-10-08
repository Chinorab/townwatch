# Quickstart: validate Townwatch end to end

## Prerequisites
- Node 24, npm.
- `.env.local` with `NEBIUS_API_KEY`, `TAVILY_API_KEY`, `UPSTASH_REDIS_REST_URL`,
  `UPSTASH_REDIS_REST_TOKEN` (see `.env.example`). Never committed.

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
npm run pipeline -- verify --place nc-edgecombe-county
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
npm run pipeline -- list --place mi-ann-arbor
npm run pipeline -- list --place ga-columbia-county
```
Expected: Ann Arbor meetings via Legistar API, Columbia County via CivicClerk API, both with
numbered items and no Tavily Extract call for them.

## 6. Pre-deploy gate
```bash
npm run check:secrets
```
Expected: no key pattern in the repo, the build output or client bundles.

# Research: Townwatch civic briefing

Phase 0 of the plan. Each decision records what was checked on 2026-10-08 (live calls unless
stated), the choice, and the alternatives.

## R1. Model catalogue and routing

- **Checked**: `GET /v1/models` on Token Factory → 4 NVIDIA models:
  `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, `nvidia/Nemotron-3_5-Lightning`,
  `nvidia/nemotron-3-super-120b-a12b`, `nvidia/Nemotron-3-Ultra-550b-a55b`
  (`research/step1/nebius-probe.json`). Toy triage prompt: Nano 244 ms, Lightning 217 ms,
  Super 293 ms (thinking off), Ultra 4 s with 685 reasoning tokens. Super wrong on 1 sample.
- **Decision**: triage = Nano 30B or Lightning 3.5, thinking off, items batched (about 10 items
  per call, JSON array out). The winner is chosen by a measured eval on about 60 real, hand-labelled
  items from the fixtures (task in tasks.md): accuracy on `decision_expected`, `topic`,
  `routine`, then cost. Escalation = Ultra 550B, one item per call, reasoning on, timeout 150 s,
  fallback Super 120B on timeout or 5xx. Source verification = the triage model.
- **Eval result (2026-10-08, T032, `research/triage-eval.json`)**: 70 real Edgecombe items
  hand-labelled by the developer (`tests/fixtures/triage-labels.json`), production prompt v2 and
  routing rule. Nano 30B: routine agreement 0.81, decision 0.69, 10 escalations, precision 0.80,
  recall 0.73, 42 s, $0.0015. Lightning 3.5: routine 0.79, decision 0.67, 18 escalations (cap
  reached), precision 0.44, recall 0.73, 13 s, $0.0015. **Decision: Nano 30B triages.** Same
  cost and recall, but Lightning's extra escalations would cost about $0.09 more of Ultra per
  place. Lightning is kept in mind for latency-critical calls.
- **Prices**: Token Factory prices are behind login. Third-party figures (Nano $0.06/$0.24,
  Super $0.30/$0.90, Ultra $1/$3 per M tokens; Lightning unknown) go in a single price table
  in config, labelled "estimate", to replace once read from the console.
- **Alternatives**: Super for triage (slower, one wrong answer, 5x Nano price); Ultra for
  everything (cost explodes with reasoning tokens, violates principle VII).

## R2. Discovery (Tavily)

- **Checked**: 5 places x 2 bodies (`research/step1/discovery-report.json`). Right official
  source found 10/10 (8 at first query, 2 after rewording with the full state name).
  Domain rules failed both ways: official sites on `.com` (allendalecounty.com, ccboe.net),
  wrong places on `.gov` (Allendale NJ, Spartanburg, Clatsop, Clarke).
- **Decision**: per body, two basic searches (1 credit each), phrased
  `"<Name> County, <State full name> <body> meeting agenda"` and
  `"<Name> County <State> <body> agendas minutes"`; exclude obvious non-official hosts
  (social, news, aggregators); send the top 6 candidates (title, URL, snippet) in one call to
  the triage model, which returns `{official, right_place, right_body, confidence, reason}`;
  keep the best accepted candidate per body. Platform detection by URL pattern routes to a
  platform reader before any generic extraction.
- **Alternatives**: Tavily advanced search (2 credits, not needed at this accuracy); Tavily
  `include_answer` (an LLM answer outside Nemotron, not citable).

## R3. Reading agendas

- **Legistar (checked, a2gov)**: public Web API, no key.
  `GET https://webapi.legistar.com/v1/{client}/events?$filter=EventDate ge datetime'...'`
  returns meetings with body, date, time, location, agenda file;
  `GET .../events/{id}/eventitems?AgendaNote=1&Attachments=1` returns 120 numbered items for
  the 5 Oct 2026 City Council meeting (`EventItemAgendaNumber`, `EventItemTitle`, matter id).
  Client name = subdomain of `*.legistar.com`.
- **CivicClerk (checked, columbiacoga)**: public OData API, no key.
  `GET https://{tenant}.api.civicclerk.com/v1/Events?$filter=startDateTime ge ...` returns
  meetings with `agendaId` and published files; `GET /v1/Meetings/{agendaId}` returns the
  nested numbered item tree; `GET /v1/Meetings/GetMeetingFileStream(fileId=N,plainText=false)`
  returns the PDF (148 KB) and `plainText=true` a text version. Tenant = subdomain of
  `*.portal.civicclerk.com`.
- **Generic sites (CivicPlus, Revize, Edlio and similar)**: Tavily Extract on the listing page
  (relative links resolved against the page URL), optional Tavily Map one hop deeper when the
  listing has no documents. Documents: try a direct download first and parse per page; on
  403/failure, fall back to Tavily Extract (checked: Edgecombe PDF is 403 for curl, readable via
  Extract, but returned as one line without page breaks).
- **Decision**: three readers behind one interface (`legistar`, `civicclerk`, `generic`).
  BoardDocs is out of v1 (JS portal, no checked public API), listed as "not covered" with a
  link, per spec US2 scenario 3.
- **PDF text per page**: `unpdf` (serverless build of pdf.js) when bytes are available; page
  boundaries recorded so citations can include pages.

## R4. Splitting agendas into items

- **Decision**: platform readers already return items. For generic documents, a deterministic
  splitter on numbering patterns (`4.8.`, `A.`, `1)`, `IV.`) with the heading hierarchy kept;
  the triage model never invents item numbers. Fixtures: Edgecombe 5 Oct 2026 agenda (items
  1 to 4.9 visible in the extract).
- **Alternative**: LLM-based splitting (costs tokens on every document, can renumber items).

## R5. Grounding, neutrality and "not stated in the record"

- **Decision**: Ultra returns JSON: a list of statements, each with `text`, `quote` (a span
  copied from the item source) and `fields` (date, amount, place, body). A deterministic
  validator keeps a statement only if its quote is found in the source (whitespace and case
  normalised) and every number, date and amount in `text` appears in the source; failing
  fields become "not stated in the record", failing statements are dropped. Neutrality: a
  word list check (for example "should", "must oppose", "unfortunately", "controversial") plus
  the prompt rules; a flagged statement is dropped and counted in the panel.
- **Alternative**: a second LLM judging grounding (more cost, still probabilistic).

## R6. Execution model for long analyses

- **Constraint**: a new place takes minutes (Ultra 4 to 96 s per call); Vercel Functions on the
  free plan cap request duration (Fluid compute, `maxDuration` up to 300 s on Hobby; exact plan
  cap to confirm at deploy).
- **Decision**: an analysis is a persisted job with stages; work advances in bounded steps.
  `POST /api/analyses` creates the job; the page polls `GET /api/analyses/{id}` and calls
  `POST /api/analyses/{id}/advance`, which takes a short lock and runs the next unit of work
  (one stage for discovery and reading, a batch of triage calls, or up to 4 parallel Ultra
  calls). Each step stays well under the cap. If the visitor leaves, the job resumes the next
  time anyone opens the place, or during the nightly run.
- **Alternatives**: one long request (breaks at the cap); a separate always-on worker on a VM
  (cost for 2 months of judging, more ops).

## R7. Hosting, storage, nightly refresh

- **Decision**: Next.js app on Vercel (free plan, same as the Argus demo), storage in Upstash
  Redis via the Vercel Marketplace free tier: job state, caches keyed by content hash, daily
  counters with TTL, budget ledger. Large document text stored compressed under hash keys.
- **Nightly refresh (stretch)**: Nebius Serverless Jobs run a container once and release it;
  they have no built-in scheduler (docs checked: `nebius ai job create --image ... --timeout`,
  min timeout 1h, CPU VMs supported, `--env-secret` for keys, billed per second while running).
  Plan: package the pipeline CLI as a container, push to Nebius Container Registry, trigger
  `nebius ai job create` from a GitHub Actions schedule each night. Fallback if blocked: the
  same CLI run directly by the GitHub Actions schedule.
- **Alternatives**: Nebius Serverless Endpoint hosting the API (always-on billing for two
  months, unknown scale to zero); Vercel Cron for nightly (works, but adds nothing Nebius).

## R8. Location ("Near you") without the address reaching our servers

- **Checked**: US Census geocoder has no CORS header (a browser `fetch` is blocked) but supports
  JSONP (`format=jsonp&callback=...`), returning coordinates for 201 Saint Andrew Street,
  Tarboro NC. Nominatim answers with `access-control-allow-origin: *`.
- **Decision**: the browser geocodes the user's address by JSONP to the Census geocoder; the
  drop-a-pin alternative uses a client map (MapLibre GL with OpenFreeMap tiles, no key). Item
  locations (public record text such as road names) are geocoded server-side once per item and
  cached (Census for street addresses, Nominatim for roads and landmarks, 1 request per second,
  with a contact user agent). Distance is computed in the browser.
- **Alternative**: proxy geocoding through our API (violates principle VI).

## R9. Visitor limits without personal data

- **Decision**: per-visitor key = SHA-256 of (IP + daily random salt held only in Redis);
  counter TTL 24 h; global daily counter; budget ledger summing recorded call costs, stop at
  12 USD. No IP or address stored in clear, nothing kept beyond 24 h.

## R10. Testing

- **Decision**: Vitest. Fixtures are real captured documents and API responses (Edgecombe
  5 Oct 2026 agenda text, Ann Arbor Legistar items for 5 Oct 2026, Columbia CivicClerk meeting
  3463), each with source URL and retrieval date. Model calls are mocked in unit tests;
  recorded real responses are replayed in pipeline tests; a small live smoke test runs on
  demand only. UI checks in a real browser with Playwright at milestones.

# Friction log

Every difficulty met with Nebius Token Factory, NVIDIA models and Tavily while building Townwatch.
Source material for the "Feedback" section of the Devpost submission (Most Valuable Feedback prize).
Format: date, product, what happened, impact, suggestion.

## Nebius Token Factory

- **2026-10-08 — Prices are behind login.** `nebius.com/token-factory/prices` redirects to
  `tokenfactory.nebius.com/organization/prices`, which shows only "Log in to continue". A builder
  cannot estimate a budget for a model routing strategy before creating an account, and
  third-party aggregators become the de facto price list (with stale or conflicting numbers).
  Suggestion: a public, crawlable price table with model ids exactly as the API expects them.
- **2026-10-08 — Model ids differ from marketing names and casing is inconsistent.** Confirmed with
  `GET /models` (25 models, 4 NVIDIA): `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`,
  `nvidia/Nemotron-3_5-Lightning`, `nvidia/nemotron-3-super-120b-a12b`,
  `nvidia/Nemotron-3-Ultra-550b-a55b`. Four casing conventions for four models; an underscore in
  "3_5". Routing code cannot guess ids, it has to read the catalogue.
- **2026-10-08 — `usage` shape differs per model.** Nano returns `completion_tokens_details: null`;
  Lightning, Super and Ultra return `reasoning_tokens` and `prompt_cache_hit_tokens`. A cost meter
  must handle both shapes.

## NVIDIA models

- **2026-10-08 — Ultra reasons by default, and reasoning is billed as output.** A 76-token
  classification prompt produced 685 reasoning tokens for 14 visible ones (4 s). Fine for the
  escalation step, but it makes Ultra roughly 50 times more expensive than its list price suggests
  on short prompts. Nano, Lightning and Super answered the same prompt in 220 to 300 ms with
  thinking off.
- **2026-10-08 — Lightning 3.5 is 3x faster than Nano 30B but over-escalates.** On 70 real
  agenda items with the same prompt: Lightning 13 s vs Nano 42 s, same cost, same recall (0.73),
  but escalation precision 0.44 vs 0.80 (it marks vendor contracts and staff reports as
  important). In a cascade the triage model's precision drives the cost of the big model, so
  Nano wins here. A published guide on Lightning vs Nano trade-offs would have saved the eval.
- **2026-10-08 — Ultra's reasoning dominates cost.** First full run on one county: 18 Ultra calls
  used 63k completion tokens of which 55k were reasoning (87%), $0.20 out of a $0.203 run; Nano
  triaged 70 items for $0.0015. A way to cap reasoning tokens per request would help budgeting.
- **2026-10-08 — Ultra can reason until `max_tokens` and return no answer.** 2 of 15 explain calls
  (short school board items, ~700 input tokens) used all 6,000 completion tokens on reasoning,
  `finish_reason: "length"`, and the reasoning text came back inside `content` (no separate
  `reasoning` field that time), with no JSON. That cost $0.036 for nothing. Mitigation: treat an
  unusable reply like a timeout and fall back to Super. A per-request reasoning budget would fix
  this at the source.
- **2026-10-08 — Nano is not fully deterministic at temperature 0.** The same 70 items with the
  same prompt gave 10 escalations in the eval run and 15 in the pipeline run an hour later.
  Caching triage by item hash makes the product stable regardless.
- **2026-10-08 — Super disagreed on a trivial case.** "Approve a $48,500 contract" → Super said
  `decision: false`; Nano, Lightning and Ultra said `true`. One sample only; to be measured on a
  real labelled set before choosing the triage model.

## Tavily

- **2026-10-08 — Extract returns PDFs as a single line.** A 2-page agenda PDF came back as 4,051
  characters with no newline and no page break, in both `basic` and `advanced` depth. Page-level
  citations are impossible from Extract output alone. Suggestion: an option to keep page
  boundaries (form feeds or `{page, text}` chunks) for PDFs.
- **2026-10-08 — Extract got through where a direct download failed.** The same PDF answers 403
  to curl, even with a browser user agent; Tavily Extract fetched it in under a second. Strong
  argument for Extract in civic-document pipelines.
- **2026-10-08 — `include_usage` reported 0 credits** for a basic extract of one successful URL,
  1 credit for an advanced one. Consistent with "1 credit per 5 URLs" but surprising when reading
  the response.
- **2026-10-08 — JS portals extract empty.** CivicClerk portals (`*.portal.civicclerk.com`) fail
  in Extract; BoardDocs returns the shell page without documents.

## Devpost

- **2026-10-08 — Rules page returns HTTP 403 to non-browser clients**, so the rules had to be read
  through a real browser.

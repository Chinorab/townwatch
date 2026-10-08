# Data Model: Townwatch civic briefing

All records are JSON values in the key-value store (Upstash Redis). Keys are listed per entity.
Hash = SHA-256 hex of the canonical content. Times are ISO 8601 UTC.

## Place
Key `place:{placeId}`. `placeId` = `{state}-{slug}` (for example `nc-edgecombe-county`).
| Field | Type | Rule |
|---|---|---|
| placeId | string | unique, lower case |
| name | string | as typed and normalised ("Edgecombe County") |
| kind | `county` \| `town` | |
| state | string | 2-letter USPS code, required before analysis (FR-001) |
| countyName | string? | for towns, the county it belongs to (FR-004) |
| bodies | BodyRef[] | max 3 (FR-004) |
| lastAnalysisId | string? | latest completed analysis |
| followed | boolean | true once analysed; used by the nightly refresh |

## Body
Embedded in Place as `BodyRef`.
| Field | Type | Rule |
|---|---|---|
| role | `executive` \| `county_executive` \| `school_board` \| `planning` | |
| name | string | official name when found ("Board of Commissioners") |
| sourceId | string? | accepted Source, null when not covered |
| coverage | `covered` \| `not_found` \| `unreadable` | shown in UI (US2 scenario 3) |

## Source
Key `source:{sourceId}`, `sourceId` = hash of URL.
| Field | Type | Rule |
|---|---|---|
| url | string | |
| host | string | |
| platform | `legistar` \| `civicclerk` \| `generic` \| `boarddocs` \| `other` | from URL pattern |
| platformKey | string? | Legistar client or CivicClerk tenant |
| verification | {official, rightPlace, rightBody: boolean, confidence: 0..1, reason: string} | FR-005 |
| accepted | boolean | true only if all three checks pass |
| checkedAt | time | |

Rejected candidates are kept on the Analysis record for the panel (FR-018).

## Document
Key `doc:{docHash}` (metadata) and `doctext:{docHash}` (gzip text).
| Field | Type | Rule |
|---|---|---|
| docHash | string | hash of extracted text, the cache key (FR-022) |
| url | string | official URL opened by citations |
| kind | `agenda` \| `packet` \| `minutes` | |
| meetingId | string | |
| retrievedAt | time | |
| via | `platform_api` \| `direct` \| `tavily_extract` | |
| pages | {n, start, end}[] \| null | char offsets per page; null when page boundaries unknown |
| readable | boolean | false for scans or failed reads |

## Meeting
Key `meeting:{meetingId}`, `meetingId` = hash of (sourceId, date, body).
| Field | Type | Rule |
|---|---|---|
| body | string | |
| date | date | from the record |
| time | string \| null | null renders "not stated in the record" |
| location | string \| null | same |
| agendaUrl | string | |
| documentHashes | string[] | |

## AgendaItem
Key `item:{itemHash}`, `itemHash` = hash of (docHash, number, text).
| Field | Type | Rule |
|---|---|---|
| number | string | official numbering verbatim ("4.8", "INT-1") |
| title | string | verbatim |
| text | string | verbatim item text |
| meetingId | string | |
| docHash | string | |
| page | number \| null | when known |
| triage | Triage? | |
| routing | {escalate: boolean, reason: `routine` \| `info_only` \| `low_impact` \| `rule_match` \| `cap`} | FR-011 |
| locations | {text, lat, lon, precision}[] | geocoded mentions, public record only |

### Triage (output of the fast model, schema-validated)
`topic` (one of schools, taxes, zoning_land_use, roads_transport, water_utilities,
public_safety, budget_spending, other), `routine` (boolean), `decisionExpected` (boolean),
`impact` (`low` \| `medium` \| `high`), `locationsMentioned` (string[], verbatim spans),
`importance` (1..5, used only for ordering under the cap).

## Explanation
Key `expl:{itemHash}:{model}`. Produced only for escalated items.
| Field | Type | Rule |
|---|---|---|
| headline | Statement | |
| statements | Statement[] | what is decided, by whom, when, what changes, how to take part |
| fields | {meetingDate, amount, place, body, commentRules: string \| "not stated in the record"} | FR-013 |
| model | string | Ultra, or Super when fallback |
| dropped | {count, reasons[]} | grounding or neutrality failures, shown in panel |

### Statement
`text` (string), `citation` (Citation). A statement without a valid citation is never stored.

### Citation
`docUrl`, `docHash`, `itemNumber`, `page` (number \| null), `quote` (verbatim span found in the
source).

## ModelCall
Appended to `calls:{analysisId}` (list).
`stage` (`verify` \| `triage` \| `explain`), `model`, `inputTokens`, `outputTokens`,
`reasoningTokens`, `ms`, `costUsd` (estimate from the price table), `ok`, `fallbackFrom?`,
`itemHash?`.

## Analysis (job)
Key `analysis:{analysisId}`.
| Field | Type | Rule |
|---|---|---|
| analysisId | string | |
| placeId | string | |
| status | `queued` \| `discovering` \| `reading` \| `triaging` \| `explaining` \| `assembling` \| `done` \| `failed` | |
| progress | {sourcesFound, docsRead, itemsTriaged, itemsEscalated, itemsExplained} | shown live (US2) |
| rejectedSources | {url, reason}[] | |
| startedAt, finishedAt | time | |
| totals | {calls, tokensByModel, costUsd, tavilyCredits} | panel (FR-018) |
| lock | (separate key `lock:analysis:{id}`, TTL 330 s) | one advance at a time |

State transitions: queued → discovering → reading → triaging → explaining → assembling → done.
Any stage may go to failed with a reason; a failed body does not fail the analysis (coverage
becomes `not_found` or `unreadable`).

## Briefing
Key `briefing:{placeId}` (latest), immutable copy `briefing:{placeId}:{analysisId}`.
`window` {from, to} (14 days back, 21 ahead, FR-015), `headlineItems` (escalated, ordered by
importance), `alsoOnAgenda` (non-escalated items: number, title verbatim, link; FR-015a),
`meetings` (calendar, FR-017), `locatedItems` (item id, lat, lon, place text) for client-side
"Near you", `panel` (copy of Analysis totals and source list), `generatedAt`.

## Limits and budget
- `visitor:{dailyHash}` counter, TTL 24 h (1 new place per visitor per day).
- `global:newplaces:{yyyy-mm-dd}` counter, TTL 48 h (10 per day).
- `ledger:total` running sum of `costUsd`; new analyses refused at 12 USD (FR-024, FR-025).
- `salt:{yyyy-mm-dd}` random salt, TTL 48 h.

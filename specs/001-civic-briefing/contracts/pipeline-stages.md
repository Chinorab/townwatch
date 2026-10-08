# Pipeline stage contracts

Each stage is a pure async function with typed input and output, runnable alone from the CLI on
cached inputs (constitution principle X). External effects go through injected clients
(`tavily`, `models`, `fetcher`, `store`) so tests can replay recorded responses.

| Stage | Input | Output | External calls |
|---|---|---|---|
| discover | Place | Candidate[] per body | Tavily search (2 per body) |
| verify | Candidate[] | Source (accepted or rejected with reason) per body | fast model, 1 call per body |
| list | Source | Meeting[] in window, each with document refs | platform API or Tavily Extract / Map |
| read | document ref | Document (text, pages or null, via) | platform API, direct fetch, Tavily Extract fallback |
| split | Document | AgendaItem[] (verbatim numbers and titles) | none |
| triage | AgendaItem[] (batches of about 10) | Triage per item | fast model |
| route | items with Triage | routing per item (FR-011 rule) | none, deterministic |
| explain | escalated AgendaItem + its source text | Explanation draft | Ultra, fallback Super |
| ground | Explanation draft + source text | Explanation (validated statements only) | none, deterministic |
| locate | AgendaItem.locationsMentioned | locations with coordinates | Census / Nominatim, cached |
| assemble | Place, Meetings, Items, Explanations, ModelCalls | Briefing | none |

CLI: `npm run pipeline -- <stage> --place nc-edgecombe-county [--from-cache]`, and
`npm run pipeline -- all --place ...` for a full run.

## Routing rule (FR-011), deterministic
1. `routine == true` → `{escalate: false, reason: "routine"}`
2. `decisionExpected == false` → `info_only`
3. `impact in (medium, high)` or `topic in (taxes, budget_spending, water_utilities,
   roads_transport, schools, zoning_land_use)` → candidate, else `low_impact`
4. Sort candidates by (impact, importance) desc; keep the first `ceil(0.25 * totalItems)`;
   the rest → `cap`.

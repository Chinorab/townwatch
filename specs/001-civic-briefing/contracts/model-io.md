# Model I/O contracts

All calls go to Nebius Token Factory (`/v1/chat/completions`), model ids read from config.
Outputs are JSON, validated with zod; optional fields are `.nullish()` (lesson from Argus:
models return null). Enum values are listed in the prompt.

## verify (fast model, thinking off)
In: place {name, state, kind}, body role, up to 6 candidates {url, title, snippet}.
Out: `[{ "url", "official": bool, "rightPlace": bool, "rightBody": bool, "confidence": 0..1, "reason": string }]`

## triage (fast model, thinking off, about 10 items per call)
In: items {id, number, title, text (truncated to 1,500 chars)} with meeting body and date.
Out: `[{ "id", "topic": enum, "routine": bool, "decisionExpected": bool, "impact": "low"|"medium"|"high", "locationsMentioned": string[], "importance": 1..5 }]`

## explain (Ultra, reasoning on; fallback Super)
In: one item: number, title, full text, meeting body, date, time, location, document URL;
rules: plain English, neutral, no opinion, copy facts only from the text.
Out:
```
{
  "headline": { "text", "quote" },
  "statements": [ { "kind": "what"|"who"|"when"|"change"|"participate", "text", "quote" } ],
  "fields": { "meetingDate", "amount", "place", "body", "commentRules" }
}
```
Every `quote` must be a verbatim span of the input text; any field not in the text must be
the exact string `not stated in the record`. The grounding stage enforces both.

## Cost accounting
Each call records `usage.prompt_tokens`, `usage.completion_tokens`,
`usage.completion_tokens_details?.reasoning_tokens` (absent for Nano), latency, and
`costUsd = in * priceIn + out * priceOut` (reasoning tokens are part of completion tokens).

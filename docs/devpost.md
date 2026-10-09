# Devpost submission: Townwatch

Copy each block into the matching Devpost field. Numbers come from the live briefings and from `research/`; update them if a demo place is analysed again.

---

## Project name

Townwatch

## Tagline (60 characters max)

What your county is deciding, sourced line by line.

## Track and prizes

- Track: Best Apps and Agents
- Also entered for: Best Use of Tavily (Tavily Search, Map and Extract run for every new place at run time)

## Links

- Live demo: https://townwatch-tau.vercel.app (open Edgecombe County, NC for the full briefing; any US county or town can be analysed from the home page)
- Repository (MIT): https://github.com/Chinorab/townwatch
- Architecture diagram: `docs/architecture.png` (upload as a gallery image)
- Video (2:18): https://youtu.be/TUu5bCDqtb4

## Built with (tags)

nvidia-nemotron, nebius-token-factory, tavily, next.js, react, typescript, zod, openai-sdk, upstash-redis, vercel, maplibre, legistar, civicclerk

---

## About the project

### Inspiration

Medill's State of Local News 2025 data lists 213 US counties with no local news source at all. Edgecombe County, North Carolina is one of them. On 5 October 2026 its Board of Commissioners had on its agenda a resolution opposing the sale of Rocky Mount's water system to a private entity. The agenda was public, in a PDF on the county website, and no newsroom was there to tell residents about it.

Washtenaw County, Michigan, home of Ann Arbor, has 12 local news sources. The difference between the two places is not whether the information exists. It is whether anyone reads it.

Local boards decide property taxes, school budgets, zoning, roads and water. Their agendas are public by law, but they are long documents scattered across county sites, school district portals and agenda platforms, written for the people in the room. Townwatch is the reader that news deserts lost.

### What it does

Type the name of a US county or town. Townwatch:

1. finds the official agenda pages of its main boards (county or town board, school board, planning board) with no per-city configuration;
2. reads every agenda item of the current period, from websites, PDFs and agenda platforms;
3. sorts every item with a small Nemotron model and sends only the decisions that matter to Nemotron 3 Ultra;
4. publishes **This week in [Town]**, a short, neutral briefing.

Every sentence of the briefing links to the agenda document and item number it comes from, with the page when the document has pages. A missing date or amount reads "not stated in the record". Every page says the official record prevails.

The page also has:

- a **calendar** of upcoming meetings, with what is on each agenda;
- **Near you**: type your address and items are ranked by distance from it. The address is geocoded in your browser and never leaves it;
- **How this was made**: sources kept and rejected (with the reason), items read, sorted and explained, and every model call with its tokens and estimated cost.

A place already analysed loads instantly from the stored briefing, at no cost. New places are limited per visitor and per day so the demo stays free for everyone.

### How we built it

Every model call runs on **Nebius Token Factory** through its OpenAI-compatible API. The design is a cascade: a small model looks at everything, the large model only at what matters, and code checks everything both of them say.

| Stage | What runs |
|---|---|
| Discover | **Tavily Search** finds candidate agenda pages, with state-specific body names (fiscal court in Kentucky, quorum court in Arkansas, police jury in Louisiana) and a second pass scoped to the county's own domain. |
| Verify | **Nemotron 3 Nano 30B** judges each candidate: official site, right place, right body. Code then rejects other states and neighbouring counties and ranks real agenda pages first. |
| Read | Platform readers for **Legistar** and **CivicClerk** public APIs. Other sites go through **Tavily Map** (one hop, with instructions) and **Tavily Extract**. PDFs are read page by page so citations carry page numbers. |
| Split | Code cuts agendas into items numbered exactly as in the document. |
| Triage | **Nemotron 3 Nano 30B**, thinking off, 10 items per request: topic, decision or information, impact on residents, places named. |
| Route | Code: routine items never escalate; decisions with impact, or on a topic the reader chose, do. At most 25% of items and 12 per place. |
| Explain | **Nemotron 3 Ultra 550B** with reasoning: what is decided, by whom, when, what changes, how to take part. Falls back to **Nemotron 3 Super 120B** on timeout or when Ultra returns no usable JSON. |
| Ground | Code keeps a sentence only if its quote is found in the source, its numbers appear in the source and it uses no opinion words. |

Measured on the first analysis of the three demo places, 8 October 2026 (191 agenda items):

| Model | Calls | Output tokens (reasoning) | Cost |
|---|---|---|---|
| Nemotron 3 Nano 30B | 47 | 25,946 (0) | $0.010 |
| Nemotron 3 Ultra 550B | 44 | 124,027 (106,352) | $0.401 |
| Nemotron 3 Super 120B | 2 | 1,051 (0) | $0.001 |

Nano sorted all 191 items for one cent. Ultra explained 29 of them (15%) and accounts for 97% of the cost. A place costs between $0.08 and $0.18 the first time and nothing after that.

Followed places are refreshed every night: unchanged agendas cost no model call, new ones are sorted and explained. The refresh is a container image that runs as a **Nebius Serverless AI job** on a CPU VM (keys injected from Nebius SecretStash) and on a nightly GitHub Actions schedule. On its first real run, Columbia County had published 14 new items, processed with 5 model calls for 3 cents; the other places cost nothing.

Analyses are persisted jobs advanced one bounded step per request, so nothing runs longer than one stage and two visitors asking for the same place share one job. Every document, triage batch and explanation is cached under a hash of its content in Upstash Redis.

Stack: Next.js 16, React 19, TypeScript, zod, the OpenAI SDK pointed at Token Factory, Upstash Redis, unpdf, MapLibre with OpenFreeMap tiles, the US Census Gazetteer (22,669 places) and the Census geocoder, deployed on Vercel. Built spec first with GitHub Spec Kit (spec, plan, contracts and tasks are in `specs/`), with 121 unit and pipeline tests including an offline replay of a full recorded Edgecombe run, and 27 browser tests including an axe WCAG 2.1 AA audit in light and dark mode.

### Best use of Tavily

Townwatch has no list of agenda URLs. Tavily is how it finds and reads the record of a place it has never seen:

- **Search** turns "Edgecombe County, North Carolina board of commissioners county council meeting agenda" into candidate pages, then a second search scoped with `include_domains` to the county's own domain when the first one misses the main board.
- **Map** with instructions ("pages that list meeting agendas and minutes") gets from a "meet the commissioners" page to the page that actually lists agendas, one hop away.
- **Extract** reads agenda listings and agenda pages, and fetches PDFs from county servers that answer 403 to direct downloads.
- Credits are counted with `include_usage` and shown to the reader in each place's panel: 7, 9 and 10 credits for the three demo places.

### Challenges we ran into

- **Same-named places.** The Census lists 24 Franklin Counties and 30 Washington Counties. Nano accepted a North Carolina site for Cumberland County, Virginia, an Ohio site for Montgomery County, Georgia, and a Connecticut school board for Vernon Parish, Louisiana. Geography moved into code: state names and codes in the domain, and the state in the letterhead of the document itself.
- **Honest measurement.** A first run on 11 news-desert counties scored 6 successes. Checking each one by hand showed that Franklin County, Arkansas had been read from Franklin County, Tennessee. After adding the checks above and re-verifying every success, the honest score is 4 of 11, and that is the number in the spec and the README.
- **Ultra can reason until `max_tokens` and return nothing.** Two short school board items used all 6,000 completion tokens on reasoning, with no JSON. That reply is now treated like a timeout and the item goes to Super.
- **Every agenda platform is different.** CivicClerk's API pages at 15 events; Legistar lists public comment speakers as numbered agenda items; CivicPlus AgendaCenter puts the meeting date only in the file name. Each became a small, tested rule.
- **Citations need pages, and Extract flattens PDFs into one line.** PDFs are now downloaded and read page by page, with Extract as the fallback when a site blocks the download.

### Accomplishments that we're proud of

- A briefing on a news-desert county where every one of the 16 sentences links to the item it comes from, and the lead story is the water system resolution a resident would want to know about.
- The grounding check works: across the three demo places it removed 6 sentences the model could not support with the source text, and the panel says so.
- One cent to read and sort 191 agenda items. The expensive model only sees what deserves it.
- The reader's address never reaches the server: geocoding and distance ranking happen in the browser.
- Limits stated as measured, not as hoped: 4 of 11 news-desert counties found with zero configuration.

### What we learned

- In a cascade, the small model's precision sets the large model's bill. On 70 hand-labelled items, Nemotron 3.5 Lightning was three times faster than Nano 30B with the same recall, but it escalated 18 items where Nano escalated 10, with an escalation precision of 0.44 against 0.80. Nano won the triage job.
- Reasoning is most of the cost: 86% of Ultra's output tokens were reasoning. Routing rules in code save more than any prompt change.
- Small models are good at reading and bad at geography. Anything checkable by code (a state, a date, a number, a quote) should be checked by code.

### What's next

- A BoardDocs reader, used by many school districts, so school boards are covered in more places.
- Alerts for a followed place when a new agenda names your street, without storing who you are.
- More platform readers (Granicus, PrimeGov) to raise the share of news-desert counties covered with zero configuration.

---

## Feedback on Nebius Token Factory, NVIDIA models and Tavily (Devpost field)

Full log with dates: https://github.com/Chinorab/townwatch/blob/master/FRICTION_LOG.md

**What worked**

- One OpenAI-compatible client for Nano, Super and Ultra; switching the triage model was one environment variable.
- `chat_template_kwargs: {enable_thinking: false}` turns Nano and Super into fast, cheap JSON classifiers (220 to 300 ms on short prompts).
- Tavily Extract fetched agenda PDFs that county servers refuse to curl; Map with instructions found agenda pages one hop away.

**What got in the way**

- Token Factory prices are behind a login, so a budget for a routing strategy cannot be planned before signing up, and third-party lists become the price source.
- Model ids use four casing conventions for four models (`NVIDIA-Nemotron-3-Nano-30B-A3B`, `Nemotron-3_5-Lightning`, `nemotron-3-super-120b-a12b`, `Nemotron-3-Ultra-550b-a55b`), and the `usage` object differs between models (Nano returns no `completion_tokens_details`).
- Ultra reasons by default and reasoning is billed as output: a 76-token prompt produced 685 reasoning tokens for 14 visible ones. Ultra can also spend the whole `max_tokens` on reasoning and return no answer.
- Nano is not fully deterministic at temperature 0 (10 then 15 escalations on the same 70 items); caching by item hash was needed for stable results.
- Tavily Extract returns a PDF as a single line with no page breaks, which makes page citations impossible from Extract alone. JavaScript agenda portals (CivicClerk, BoardDocs) extract empty.

**Suggestions**

- A public, machine-readable price and model list with ids exactly as the API expects them.
- A per-request reasoning budget for Ultra, so cost and latency can be capped without turning reasoning off.
- A guide comparing Nano and Lightning for classification in a cascade.
- A Tavily Extract option that keeps PDF page boundaries.

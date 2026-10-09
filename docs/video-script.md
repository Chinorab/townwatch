# Video script: Townwatch (2:45 target, 3:00 hard limit)

Screen recording only. The story is **one county with no newspaper**: Edgecombe County, North
Carolina, where the board voted on its position on selling Rocky Mount's water system and no
newsroom was there to say so. Townwatch reads that agenda, then a second news desert live.

Voice-over text: `docs/voiceover.txt`. Burn subtitles in, judges may watch muted. No music
under the narration.

Recording setup: 1920×1080, Chrome at 125% zoom, light theme, cursor visible, notifications
off. The citation beat uses a school board item: its PDF (edl.io) opens from anywhere, at the
cited page. The county commissioners' PDFs refuse visitors outside the US (FRICTION_LOG,
2026-10-09), so do not click those from France. The new-place run counts against the
one-new-place-per-day limit: do not test it on the recording day before the take.

| Time | Screen | Voice-over |
|---|---|---|
| 0:00–0:12 | Home page, slow scroll from the headline to "In 213 US counties, no local news source is left." | "In two hundred and thirteen US counties, there is no local news source left. Nobody reads the county commission agenda for the people who live there." |
| 0:12–0:24 | Type "Edgecombe" in the search box; the candidate "Edgecombe County, North Carolina, Briefing ready" appears; click it. | "Townwatch reads it for them. Type a county or a town, anywhere in the US." |
| 0:24–0:44 | The briefing: masthead "This week in Edgecombe County", the dek, the disclaimer. Hold on the lead story about the water system resolution, then scroll through two more stories. | "This is Edgecombe County, North Carolina, one of those news deserts. On October fifth, its Board of Commissioners considered a resolution opposing the sale of Rocky Mount's water system to a private entity. Townwatch found it, explained it in plain English, and said how to take part." |
| 0:44–1:00 | Scroll to the school board story (item 8.12.B, student support services). Hover the citation "Item 8.12.B, page 4", click it: the official agenda PDF opens at page 4. Back. Point at "not stated in the record" in the facts row. | "Every sentence links to the agenda item it comes from, down to the page. Click it, and the official document opens right there. When the record does not give an amount or a time, the page says so. Nothing is guessed." |
| 1:00–1:14 | Near you: type the county administration address in Tarboro, press Enter; the list ranks items by distance. | "Near you ranks items by distance from your address. The address goes from your browser to the Census Bureau, and never to Townwatch." |
| 1:14–1:40 | How this was made: the flow 2 sources, 73 items, 73 sorted, 9 explained; then the model table with Nano and Ultra, tokens and cost. | "Here is how it was made. Tavily found the official agenda pages, and Nemotron Nano checked that each one is official and belongs to the right county. Nano then sorted all seventy-three items, ten per request, for a third of a cent. Only nine decisions went to Nemotron Ultra, five hundred and fifty billion parameters, on Nebius Token Factory. Code checked every sentence against the source before it was published. The whole county cost eight cents." |
| 1:40–2:15 | Porter County, Indiana (largest county on the Medill news-desert list, 175,335 people), not read yet: click **Read the agendas**; the stages tick live (finding pages, reading, sorting, explaining). Cut the waits, keep each stage visible. The briefing appears. | "Now Porter County, Indiana: a hundred and seventy-five thousand people, and not one local news source. Nobody has read it here yet. No setup, no list of websites: Tavily searches, Nano verifies, the agendas are read, every item is sorted, and the decisions that matter are explained. A few minutes later, the county has a briefing." |
| 2:15–2:32 | Architecture still (`docs/architecture.png`), then the measured stats row. | "A small model looks at everything, the large one only at what matters, and code checks both. Across three places, Nano sorted a hundred and ninety-one items for one cent; Ultra was ninety-seven percent of the bill. Every night, a refresh re-reads the places people follow and pays only for new agendas; it ships as a container that runs as a Nebius serverless job." |
| 2:32–2:45 | Closing card: Townwatch, townwatch-tau.vercel.app, github.com/Chinorab/townwatch, MIT. | "Townwatch. The agenda, read for the towns that lost their newspaper." |

## Before recording

- Check the three demo briefings are current (the nightly refresh, or
  `npm run pipeline -- refresh` after a backup, see `deploy/README.md`).
- Pick the live place the day before: a county from `data/medill-2025-news-deserts.tsv` that
  has no briefing yet (`/api/places?q=` shows `analysed: false`) and whose agendas are online.
  The 11 SC-004 counties (Wasco included) already have briefings in production. Check it with
  `npm run pipeline -- discover --place <id>` (about $0.001 and a few Tavily credits), which also
  warms the cache so the recorded run is quicker.
- Numbers in the narration (73 items, 9 explained, eight cents, 191 items, 97%) must match the
  panel on the day of recording. Update the text if a refresh changed them.
- The Nebius job `townwatch-refresh` ran on 9 October 2026; to show it in the video, restart it
  from the console (Serverless AI, Jobs) and film its log ending with `Refreshed N places`.

## Timing check

About 330 words of narration, roughly 2:20 at a calm pace, leaving room for the two silent
beats: the official PDF opening (0:50) and the new briefing appearing (2:12).

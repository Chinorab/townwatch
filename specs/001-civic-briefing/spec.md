# Feature Specification: Townwatch civic briefing

**Feature Branch**: `001-civic-briefing`

**Created**: 2026-10-08

**Status**: Draft

**Input**: User description: "Townwatch civic briefing web app (English). A US resident types a county or town name (optionally a street address and topics) ... the system discovers the official agenda sources with no per-city configuration, triages every agenda item with a small model, escalates only important items to a large reasoning model, and publishes a sourced, neutral briefing 'This week in [Town]', a 'Near you' section computed in the browser, a meeting calendar and a 'How this was made' panel. Demo places: Edgecombe County NC, Wasco County OR, Ann Arbor MI (Columbia County GA optional). Budget about 20 USD of model credit." (full text in the step 2 conversation log, 2026-10-08)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Read the briefing for my place (Priority: P1)

A resident of Edgecombe County, North Carolina, where no local newspaper remains, opens Townwatch,
types "Edgecombe County, NC" and reads "This week in Edgecombe County": a short editorial page
listing what the county commission and the school board will decide or have just decided, each
explained in plain English with what changes for residents and how to take part. Every sentence
links to the official agenda document and item it comes from.

**Why this priority**: this is the product. Without it nothing else has value, and it alone
already demonstrates the full pipeline (discovery, triage, escalation, writing) to judges.

**Independent Test**: open the app, pick one of the demo places, check that the briefing appears,
that each statement opens the right official document at the right item, and that no statement
lacks a source.

**Acceptance Scenarios**:

1. **Given** a demo place already analysed, **When** the resident selects it, **Then** the
   briefing appears without waiting for any new analysis.
2. **Given** a briefing is displayed, **When** the resident activates the citation of any
   statement, **Then** the official source document opens and the cited item number (and page
   when known) is shown next to it.
3. **Given** an agenda item whose meeting date, amount or location is absent from the document,
   **When** it appears in the briefing, **Then** the missing value reads "not stated in the
   record".
4. **Given** any briefing, **When** the resident reads it, **Then** a visible notice states that
   it is an automatic summary and that the official record prevails.
5. **Given** an agenda item about a contested topic (for example the sale of a public water
   system), **When** it is explained, **Then** the text states what is proposed, by whom, when
   and what it changes, with no opinion, recommendation or loaded wording.

---

### User Story 2 - Analyse a place nobody has analysed yet (Priority: P2)

A resident of a small county that Townwatch has never seen types its name. Townwatch finds the
official agenda sources on its own, shows its progress step by step (sources found, documents
read, items sorted, items explained), then shows the briefing. The resident never configures
anything.

**Why this priority**: zero per-city configuration is the core differentiator against existing
tools that only cover large cities. It is also the riskiest part, so it comes after the demo
briefing is secure.

**Independent Test**: enter a US county that is not in the cache; check that official sources
for at least the main governing body are found without any manual input, that wrong-place or
unofficial sources are rejected, and that a briefing is produced or a clear explanation of why
not.

**Acceptance Scenarios**:

1. **Given** a place not yet analysed, **When** the resident submits it, **Then** progress is
   shown live by stage, and the briefing appears when done.
2. **Given** search results that include a same-named place in another state, or a news site,
   **When** sources are verified, **Then** those results are rejected and never cited.
3. **Given** a place whose agendas sit on a portal that cannot be read, **When** the analysis
   ends, **Then** the resident sees which bodies were covered, which were not, and a link to the
   official portal for the uncovered ones.
4. **Given** the new-place allowance is exhausted, **When** a resident submits a new place,
   **Then** the resident is told plainly and offered the already analysed places.
5. **Given** a place that was analysed before, **When** anyone selects it again, **Then** no new
   paid analysis runs unless its documents changed.

---

### User Story 3 - See what is near me and what matters to me (Priority: P2)

The resident optionally enters a street address and picks topics (schools, taxes, zoning, roads,
water, public safety, budget). A "Near you" section lists the items that mention a location close
to that address, and the briefing highlights the chosen topics. The address never leaves the
resident's device for Townwatch's servers.

**Why this priority**: per-address relevance is the second differentiator, and the privacy rule
is part of the product promise.

**Independent Test**: on a demo place, enter an address inside the county, check that items
mentioning nearby roads or parcels rank first in "Near you", and confirm that no request to
Townwatch's servers contains the address.

**Acceptance Scenarios**:

1. **Given** an address and a briefing with located items, **When** "Near you" is computed,
   **Then** items are ordered by distance and each shows the place named in the record.
2. **Given** no item mentions a location near the address, **When** "Near you" is shown,
   **Then** it says so plainly instead of padding with unrelated items.
3. **Given** the resident entered an address, **When** the network traffic to Townwatch's
   servers is inspected, **Then** the address appears in none of it.
4. **Given** topics are selected, **When** the briefing is shown, **Then** matching items are
   marked and can be filtered, and unselected topics remain reachable.

---

### User Story 4 - Know when and how to take part (Priority: P3)

The resident sees a calendar of upcoming meetings for the place (body, date, time, location,
link to agenda) and, for each explained item, how to take part: public comment rules and
deadlines when the record states them.

**Why this priority**: turns information into civic action; cheap once the agendas are parsed.

**Independent Test**: on a demo place, check that every upcoming meeting found in the sources
appears with its official agenda link, and that nothing is listed without a source.

**Acceptance Scenarios**:

1. **Given** agendas for future meetings, **When** the calendar is shown, **Then** meetings are
   listed in date order with body, date, time and location, each linked to its agenda.
2. **Given** a meeting whose time or room is not in the record, **When** it is listed, **Then**
   the missing value reads "not stated in the record".

---

### User Story 5 - See how the briefing was made (Priority: P3)

A judge or a curious resident opens "How this was made" and sees, for the current briefing:
the sources found and kept or rejected, the number of agenda items sorted by the fast model, the
number escalated to the reasoning model and why, the tokens used and the estimated cost, and the
date of analysis.

**Why this priority**: it is the visible proof of efficient model routing, a judging criterion,
and it builds trust. It needs the data the pipeline already records.

**Independent Test**: open the panel on a demo place and check that the counts match the
briefing (items shown equal items escalated or explicitly listed) and that cost totals equal the
sum of recorded calls.

**Acceptance Scenarios**:

1. **Given** a briefing, **When** the panel opens, **Then** it shows sources (kept and rejected
   with reason), items triaged, items escalated, tokens per model and estimated total cost.
2. **Given** a briefing served from cache, **When** the panel opens, **Then** it shows the
   original analysis figures and the date, and states that this view cost nothing new.

---

### User Story 6 - Followed places stay fresh (Priority: P4, stretch)

Places that have been analysed are re-checked automatically every night; only new or changed
documents are processed, so briefings stay current at low cost.

**Why this priority**: valuable for real use and encouraged by the hackathon, but the demo works
without it. Built last; documented as future work if time runs out.

**Independent Test**: publish a new agenda for a followed place (or wait for one), let the
nightly run happen, check the briefing includes it and that unchanged documents were not
reprocessed.

**Acceptance Scenarios**:

1. **Given** a followed place with no new documents, **When** the nightly check runs, **Then**
   no model call is made for it.
2. **Given** a new agenda was published, **When** the nightly check runs, **Then** only that
   agenda is processed and the briefing date updates.

### Edge Cases

- Place name is ambiguous (Columbia County exists in several states): the resident must choose
  the state before any analysis.
- Place has no findable online agendas: say so, list what was searched, and show no briefing.
- Agenda found but older than the briefing window: show the latest available meeting with its
  date clearly, never present it as "this week".
- Document is a scanned image without text: mark the source as unreadable, do not guess.
- Very long agenda packet (hundreds of pages): process the agenda itself; packets only for
  escalated items, within budget limits.
- Same item appears in agenda and minutes: present it once, citing both.
- Reasoning model is slow or fails: fall back to the mid-size model, record the fallback in the
  panel; never show an uncited or unvalidated explanation.
- Search returns a document from a same-named place in another state: rejected by verification
  (observed in step 1: Allendale, New Jersey for Allendale County, South Carolina).
- Address outside the place: "Near you" says the address is outside the area.
- Budget reached for the day: new-place analyses pause, cached places keep working.

## Clarifications

### Session 2026-10-08

- Q: May the device send the address to a public geocoder, or must location stay on the device? → A: Both: Census geocoder from the browser by default, drop-a-pin alternative with no address leaving the device (FR-021).
- Q: What limit applies to new places requested by visitors? → A: Live analysis of any place, 10 new places per day globally, 1 per visitor per day, plus a 12 USD cumulative safety stop (FR-024).
- Q: Which agenda items are escalated to the reasoning model? → A: Explicit two-step rule: routine items never; decision items with medium or high resident impact, or touching taxes, budget, water, roads, schools or zoning, escalate; capped at 25% of items, most important first (FR-011).
- Q: When the user picks a town, which bodies are covered? → A: The town's council, its county's commission and the school board serving the town; 3 bodies maximum (FR-004).
- Q: How are non-escalated items shown? → A: Listed under "Also on the agenda" with the official item number and title verbatim, linked to the source, no generated text (FR-015a).

## Requirements *(mandatory)*

### Functional Requirements

**Place and preferences**

- **FR-001**: Users MUST be able to choose a US county or town by name, with the state
  disambiguated before analysis.
- **FR-002**: Users MAY add a street address and select topics from a fixed list (schools,
  taxes, zoning and land use, roads and transportation, water and utilities, public safety,
  budget and spending, other).
- **FR-003**: The address MUST be processed only on the user's device; it MUST NOT be sent to or
  stored by Townwatch's servers. [See FR-021 on the location lookup.]

**Discovery and reading**

- **FR-004**: The system MUST find candidate official agenda sources for a place from its name
  alone, for at most three governing bodies. For a county: the county commission or council,
  the school board, and the planning or zoning body. For a town: the town or city council, the
  commission or council of the county it belongs to, and the school board serving the town.
- **FR-005**: Each candidate source MUST be verified as official, belonging to the right place
  and to the right body before use; rejected candidates are recorded with a reason.
- **FR-006**: The system MUST read agenda listings and agenda documents in PDF or web form,
  including listings one link away from the found page.
- **FR-007**: The system MUST support agenda platforms that need a dedicated reader (v1:
  Legistar and CivicClerk) without any per-place setting.
- **FR-008**: Each agenda MUST be split into items that keep their official item number, title,
  meeting, body and date.

**Analysis**

- **FR-009**: Every item MUST be classified by a fast, low-cost model: topic, whether a decision
  is expected or it is information only, impact on residents, locations mentioned, importance.
- **FR-010**: Only items classified as important MUST be passed to the reasoning model, which
  writes: what is decided, by whom, when, what changes concretely, how to take part.
- **FR-011**: The routing rule MUST be explicit, recorded per item with its reason, and
  testable. Step 1: routine items never escalate (approval of minutes, proclamations,
  recognitions, appointments, roll call, consent agenda items not pulled for discussion).
  Step 2: a remaining item escalates when a decision is expected AND (its resident impact is
  medium or high OR its topic is taxes, budget, water and utilities, roads, schools, or zoning
  and land use). Step 3: escalations are capped at 25% of a place's items and at 12 items per place
  (added 2026-10-08: a 120-item city council agenda would otherwise cost about /usr/bin/bash.30), keeping
  the highest impact first; items over the cap are listed as non-escalated with reason "cap".
- **FR-012**: Every generated statement MUST carry a citation (source document, item number,
  page when known). Statements without a valid citation MUST be removed before display.
- **FR-013**: Dates, amounts, places and names MUST match the source text; when absent, the
  output MUST say "not stated in the record".
- **FR-014**: Outputs MUST be neutral: no opinion, recommendation or persuasive wording; a check
  MUST flag violations before display.

**Presentation**

- **FR-015**: The system MUST present a briefing titled "This week in [Place]" covering meetings
  from the previous 14 days and the next 21 days, important items first.
- **FR-015a**: Items that were not escalated MUST be listed under "Also on the agenda" with
  their official item number and title copied verbatim from the record, linked to the source;
  no generated text is shown for them.
- **FR-016**: The system MUST present a "Near you" section ordered by distance from the user's
  address when an address is given.
- **FR-017**: The system MUST present a calendar of upcoming meetings with body, date, time,
  location and agenda link.
- **FR-018**: The system MUST present a "How this was made" panel: sources kept and rejected,
  items triaged, items escalated, tokens and estimated cost per model, analysis date.
- **FR-019**: Every briefing MUST display the notice: automatic summary; the official record
  prevails.
- **FR-020**: A privacy page MUST explain what is and is not collected.
- **FR-021**: Turning the address into a map position MUST happen from the user's device and
  MUST NOT pass through Townwatch's servers. By default the device sends the typed address
  directly to the public US Census geocoder; as an alternative the user can drop a pin on a map
  instead of typing an address, in which case no address leaves the device. The privacy page
  names the Census geocoder and explains both options.

**Cost, cache and limits**

- **FR-022**: Documents and analyses MUST be cached so that the same document is never processed
  twice by the same step; a cached place loads without any model call.
- **FR-023**: Every model call MUST be recorded with model, tokens (input, output, reasoning),
  duration and estimated cost.
- **FR-024**: Any visitor MAY start a live analysis of a new place, within these limits: at most
  10 new places per day across all visitors, and at most 1 new place per visitor per day. The
  per-visitor limit MUST be enforced without storing personal data (no account, no stored
  address; a short-lived anonymous counter only). A global safety stop halts all new analyses
  once cumulative model spend recorded by the app reaches 12 USD.
- **FR-025**: When the budget limit is reached, cached places MUST keep working and the user MUST
  be told why new analyses are paused.

**Freshness (stretch)**

- **FR-026**: Analysed places SHOULD be re-checked nightly, processing only new or changed
  documents.

### Key Entities

- **Place**: a US county or town; name, state, identifier, list of governing bodies, last
  analysis date.
- **Governing body**: commission, council, school board or planning body of a place; its
  verified official source(s).
- **Source**: an official web page or portal; address, platform type, verification result and
  reason, date checked.
- **Document**: an agenda, agenda packet or minutes file; source, meeting, retrieval date,
  content fingerprint, readable or not, page boundaries known or not.
- **Meeting**: body, date, time, location, documents.
- **Agenda item**: official number, title, text, meeting, triage result, escalated or not.
- **Explanation**: the plain-English write-up of an escalated item; statements, each with its
  citation; "not stated in the record" markers.
- **Citation**: document, item number, page (optional), quoted source span.
- **Model call record**: stage, model, tokens, duration, estimated cost, related item or
  document.
- **Briefing**: a place's assembled output at a given date: items, explanations, calendar,
  panel figures.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of statements shown in the briefings of the demo places carry a citation that
  opens the right official document; 0 uncited statements (checked automatically).
- **SC-002**: On a manual review of the demo briefings, 0 invented dates, amounts or places, and
  0 sentences expressing an opinion or recommendation.
- **SC-003**: A cached place's briefing is readable within 2 seconds of selecting it.
- **SC-004**: A new place, with no configuration, produces a briefing for at least its main
  governing body in at least 7 of 10 test counties drawn from the Medill news-desert list, in
  under 5 minutes each.
- **SC-005**: No more than 25% of agenda items reach the reasoning model, and a full new-place
  analysis costs under 0.25 USD on average.
- **SC-006**: Total model spend for the whole project, including development and the judging
  period, stays under 20 USD.
- **SC-007**: In a test session with an address entered, no request to Townwatch's servers
  contains the address.
- **SC-008**: A first-time visitor finds the most important decision for a demo place and its
  meeting date within 60 seconds, without instructions.
- **SC-009**: The interface meets WCAG AA contrast and keyboard-navigation checks.

## Assumptions

- Target users read English and use a phone or laptop with a normal connection; the layout must
  work on both.
- No user accounts in v1: nothing to sign up for. "Following" a place means it is in the set of
  analysed places refreshed nightly, not a per-person subscription; email or push alerts are
  future work.
- Coverage is limited to agendas published online by the place itself or its official platform;
  video recordings, social media posts and news coverage are out of scope.
- Briefing window defaults to the previous 14 days and the next 21 days, because small bodies
  meet monthly.
- Up to three bodies per place in v1, chosen as in FR-004 (county vs town).
- Location matching for "Near you" relies on places named in the record (roads, parcels,
  addresses, landmarks); items without a location appear in the briefing but not in "Near you".
- Dependencies (hackathon constraints, not design choices): web discovery and reading via the
  Tavily API; all model inference via Nebius Token Factory with NVIDIA Nemotron models (fast
  model for triage, Nemotron 3 Ultra for explanations, mid-size model as fallback).
- Step 1 findings drive defaults: text from PDFs read through the discovery service has no page
  boundaries, so the item number is the guaranteed anchor and the page is added when available.
- The live demo must stay free and available to judges until 15 December 2026.

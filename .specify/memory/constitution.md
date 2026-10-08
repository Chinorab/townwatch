<!--
Sync Impact Report
Version change: template (unversioned) -> 1.0.0
Modified principles: all template placeholders replaced (first ratification)
Added principles: I. Source or Silence; II. Strict Neutrality; III. Nothing Invented;
  IV. Official Sources Only; V. Zero Per-City Configuration; VI. Privacy by Design;
  VII. Frugal, Measured Model Routing; VIII. Secrets Stay Secret; IX. Real Data Only;
  X. Testable Pipeline Stages
Added sections: Product and Design Constraints; Delivery Workflow and Quality Gates
Removed sections: none
Templates: plan/spec/tasks templates read this file at runtime; no template edits required.
Deferred TODOs: none
-->

# Townwatch Constitution

Townwatch turns the official agendas of US counties, towns and school boards into a sourced,
neutral weekly briefing for residents, starting with the counties that no longer have any local
news source. Entry for the Nebius x NVIDIA Global AI Hackathon (track: Best Apps and Agents,
bonus: Best Use of Tavily).

## Core Principles

### I. Source or Silence (NON-NEGOTIABLE)
- Every sentence of a briefing MUST link to the official source document it comes from and to
  the agenda item number it describes.
- A page number MUST be added whenever the document could be read page by page; it MAY be
  omitted only when the text was obtained without page boundaries.
- A claim with no cited document and item MUST NOT be shown. The writer step drops it; the UI
  never renders uncited text.

Rationale: residents must be able to verify every line in seconds; a civic summary that cannot be
checked is worse than none.

### II. Strict Neutrality (NON-NEGOTIABLE)
- Briefings MUST explain what is being decided, by whom, when, and what changes concretely.
- Briefings MUST NOT express an opinion, recommend a position, rank items by political value, or
  use persuasive or loaded wording.
- "How to take part" information (meeting date, public comment rules) is factual and allowed.

Rationale: the product replaces a missing newsroom's reporting function, not its editorial page;
trust across the political spectrum is the product.

### III. Nothing Invented (NON-NEGOTIABLE)
- Dates, places, amounts, names and vote outcomes MUST come verbatim from the record.
- Any of these absent from the record MUST be displayed as "not stated in the record".
- Model outputs MUST be validated against a schema; values that cannot be traced to the source
  text are rejected, not repaired by guessing.

Rationale: a wrong date or amount in a civic notice causes real harm (missed hearings, false
alarm about taxes).

### IV. Official Sources Only
- Accepted sources: government sites, school district sites, and official agenda platforms
  (Legistar, CivicClerk, CivicPlus AgendaCenter, BoardDocs, Granicus and equivalents).
- News sites, social media, aggregators and blogs MUST NOT be used as sources.
- A domain rule alone is insufficient (step 1 showed official sites on .com and wrong places on
  .gov). Each discovered source MUST pass a model check: official, right place, right body.

Rationale: the briefing's authority is borrowed entirely from the official record.

### V. Zero Per-City Configuration
- Discovery MUST work from a place name alone (plus optional address and topics).
- Code MAY contain readers per platform (for example Legistar, CivicClerk) but MUST NOT contain
  per-city scrapers, URLs or rules.

Rationale: per-city setup is why existing tools only cover profitable cities; removing it is the
project's core differentiator.

### VI. Privacy by Design
- The user's address MUST stay in the browser; proximity ("Near you") is computed client-side.
- Nothing identifying the user is stored server-side; server logs carry no address or query
  history tied to a person.
- A privacy page MUST exist before the app goes live.

Rationale: following local politics must not create a profile of who cares about what.

### VII. Frugal, Measured Model Routing
- All inference runs on Nebius Token Factory with NVIDIA Nemotron models.
- Bulk triage MUST use a small Nemotron (Nano or Lightning, thinking off). Nemotron 3 Ultra MUST
  be reserved for items triage marks as important; Super is a fallback, not a default.
- Every model call MUST be logged with model id, input, output and reasoning tokens, latency and
  estimated cost; these totals are shown in the "How this was made" panel.
- Documents and analyses MUST be cached by content hash; the same document is never processed
  twice by the same step and model.
- Total Token Factory spend for the project MUST stay within about 20 USD; the account balance
  is shared with another live demo.

Rationale: routing that is explicit and measured is both the hackathon's judging focus and what
makes rural coverage affordable.

### VIII. Secrets Stay Secret
- API keys (Nebius, Tavily) MUST live only in environment variables.
- Keys MUST NOT appear in code, in the repository, in logs, or in any client bundle; this is
  checked before every deployment.

### IX. Real Data Only
- Demo and tests use real places and real public documents.
- No fabricated numbers, places, quotes or testimonials anywhere, including the video and README.
- Test fixtures are captured real documents, stored with their source URL and retrieval date.

### X. Testable Pipeline Stages
- The pipeline is split into separately testable stages: discovery, extraction, chunking,
  triage, escalation, writing.
- Each stage has a typed input and output and can run alone from the command line on cached
  inputs.
- Automated tests MUST cover the pipeline stages and the routing decisions (which items reach
  Ultra and why), and the citation rule (no uncited sentence survives).

## Product and Design Constraints

- English everywhere: UI, model outputs, code, comments, README, commit messages.
- A visible, discreet disclaimer on every briefing: automatic summary; the official record
  prevails.
- Look: an editorial local newspaper. Large type, the briefing is the centrepiece, readable by
  any resident. WCAG AA is the floor.
- Banned: purple gradients, pill-shaped buttons, emojis (icons instead), dashes in copy,
  generic AI marketing copy, any mention or tag of AI in texts and images.
- A favicon MUST exist before the first public deployment.
- Design skills are loaded before any front-end work, and visual checks are run in a real
  browser at each important step.

## Delivery Workflow and Quality Gates

- Solo builder, two other hackathons in parallel. Submission target: 29 October 2026 (hard
  deadline 30 October 2026, 10:00 PDT).
- Milestones: spec validated 10 Oct; end-to-end pipeline on one place 18 Oct; final UI, deployed
  app and three demo places 25 Oct; tests, README and Devpost page 27 Oct; video 28 Oct.
- Spec-driven: no application code before the user validates the spec and scope.
- Scope discipline: anything not needed for the demo is cut or documented as future work. The
  nightly Serverless Job refresh is a stretch goal, built last.
- Every friction with Nebius, NVIDIA models or Tavily is recorded in FRICTION_LOG.md the day it
  happens.
- PROGRESS.md is updated after each significant step.
- Deliverables gate: public repo with MIT license visible in the About section, README explaining
  Nemotron, Token Factory and other Nebius tools, public YouTube video under 3 minutes, free live
  demo available until 15 December 2026.

## Governance

- This constitution supersedes other practices in this repository. Specs, plans and tasks MUST
  be checked against it; a conflict is resolved by changing the spec, or by amending the
  constitution explicitly.
- Amendments are proposed in conversation, approved by the project owner, recorded here with a
  version bump and a Sync Impact Report.
- Versioning: MAJOR for removing or redefining a principle, MINOR for a new principle or
  materially expanded guidance, PATCH for wording.
- Principles I, II and III are non-negotiable: they may be clarified, never weakened.
- Runtime guidance lives in PROGRESS.md (state) and FRICTION_LOG.md (platform feedback).

**Version**: 1.0.0 | **Ratified**: 2026-10-08 | **Last Amended**: 2026-10-08

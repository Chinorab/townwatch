// Shared data model (specs/001-civic-briefing/data-model.md). Model outputs are parsed with these
// schemas; optional model fields are nullish because Nemotron returns null for absent values.
import { z } from "zod";

export const NOT_STATED = "not stated in the record";

export const TOPICS = [
  "schools",
  "taxes",
  "zoning_land_use",
  "roads_transport",
  "water_utilities",
  "public_safety",
  "budget_spending",
  "other",
] as const;
export const Topic = z.enum(TOPICS);
export type Topic = z.infer<typeof Topic>;

export const BodyRole = z.enum(["executive", "county_executive", "school_board", "planning"]);
export type BodyRole = z.infer<typeof BodyRole>;

export const Platform = z.enum(["legistar", "civicclerk", "generic", "boarddocs", "other"]);
export type Platform = z.infer<typeof Platform>;

export const BodyRef = z.object({
  role: BodyRole,
  name: z.string(),
  sourceId: z.string().nullable(),
  coverage: z.enum(["covered", "not_found", "unreadable"]),
  portalUrl: z.string().nullable().optional(),
});
export type BodyRef = z.infer<typeof BodyRef>;

export const Place = z.object({
  placeId: z.string(),
  name: z.string(),
  kind: z.enum(["county", "town"]),
  state: z.string().length(2),
  stateName: z.string(),
  countyName: z.string().nullable().optional(),
  bodies: z.array(BodyRef).max(3),
  lastAnalysisId: z.string().nullable().optional(),
  followed: z.boolean().default(false),
});
export type Place = z.infer<typeof Place>;

export const Candidate = z.object({
  role: BodyRole,
  url: z.string(),
  title: z.string(),
  snippet: z.string(),
  score: z.number(),
});
export type Candidate = z.infer<typeof Candidate>;

export const Verification = z.object({
  url: z.string(),
  official: z.boolean(),
  rightPlace: z.boolean(),
  rightBody: z.boolean(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  bodyName: z.string().nullish(),
});
export type Verification = z.infer<typeof Verification>;

export const Source = z.object({
  sourceId: z.string(),
  role: BodyRole,
  url: z.string(),
  host: z.string(),
  platform: Platform,
  platformKey: z.string().nullable(),
  verification: Verification,
  accepted: z.boolean(),
  checkedAt: z.string(),
});
export type Source = z.infer<typeof Source>;

export const PageSpan = z.object({ n: z.number().int(), start: z.number().int(), end: z.number().int() });

export const DocumentRec = z.object({
  docHash: z.string(),
  url: z.string(),
  kind: z.enum(["agenda", "packet", "minutes"]),
  meetingId: z.string(),
  retrievedAt: z.string(),
  via: z.enum(["platform_api", "direct", "tavily_extract"]),
  pages: z.array(PageSpan).nullable(),
  readable: z.boolean(),
});
export type DocumentRec = z.infer<typeof DocumentRec>;

export const Meeting = z.object({
  meetingId: z.string(),
  sourceId: z.string(),
  body: z.string(),
  role: BodyRole,
  date: z.string(), // YYYY-MM-DD from the record
  time: z.string().nullable(),
  location: z.string().nullable(),
  agendaUrl: z.string(),
  documentHashes: z.array(z.string()),
  /** false for a scheduled meeting whose agenda is not published yet (platform readers). */
  agendaPublished: z.boolean().optional(),
});
export type Meeting = z.infer<typeof Meeting>;

export const Triage = z.object({
  topic: Topic,
  routine: z.boolean(),
  decisionExpected: z.boolean(),
  impact: z.enum(["low", "medium", "high"]),
  locationsMentioned: z.array(z.string()),
  importance: z.number().int().min(1).max(5),
});
export type Triage = z.infer<typeof Triage>;

export const RoutingReason = z.enum(["routine", "info_only", "low_impact", "rule_match", "cap"]);
export const Routing = z.object({ escalate: z.boolean(), reason: RoutingReason });
export type Routing = z.infer<typeof Routing>;

export const ItemLocation = z.object({
  text: z.string(),
  lat: z.number(),
  lon: z.number(),
  precision: z.enum(["address", "road", "place"]),
});
export type ItemLocation = z.infer<typeof ItemLocation>;

export const AgendaItem = z.object({
  itemHash: z.string(),
  number: z.string(),
  title: z.string(),
  text: z.string(),
  meetingId: z.string(),
  docHash: z.string(),
  docUrl: z.string(),
  page: z.number().int().nullable(),
  triage: Triage.optional(),
  routing: Routing.optional(),
  locations: z.array(ItemLocation).optional(),
});
export type AgendaItem = z.infer<typeof AgendaItem>;

export const Citation = z.object({
  docUrl: z.string(),
  docHash: z.string(),
  itemNumber: z.string(),
  page: z.number().int().nullable(),
  quote: z.string().min(1),
});
export type Citation = z.infer<typeof Citation>;

export const StatementKind = z.enum(["headline", "what", "who", "when", "change", "participate"]);
export const Statement = z.object({ kind: StatementKind, text: z.string().min(1), citation: Citation });
export type Statement = z.infer<typeof Statement>;

export const ExplanationFields = z.object({
  meetingDate: z.string(),
  amount: z.string(),
  place: z.string(),
  body: z.string(),
  commentRules: z.string(),
});
export type ExplanationFields = z.infer<typeof ExplanationFields>;

/** Raw Ultra output before grounding (contracts/model-io.md). */
export const ExplanationDraft = z.object({
  headline: z.object({ text: z.string(), quote: z.string().nullish() }),
  statements: z.array(
    z.object({
      kind: z.enum(["what", "who", "when", "change", "participate"]),
      text: z.string(),
      quote: z.string().nullish(),
    }),
  ),
  fields: z.object({
    meetingDate: z.string().nullish(),
    amount: z.string().nullish(),
    place: z.string().nullish(),
    body: z.string().nullish(),
    commentRules: z.string().nullish(),
  }),
});
export type ExplanationDraft = z.infer<typeof ExplanationDraft>;

export const Explanation = z.object({
  itemHash: z.string(),
  headline: Statement.nullable(),
  statements: z.array(Statement),
  fields: ExplanationFields,
  model: z.string(),
  dropped: z.object({ count: z.number().int(), reasons: z.array(z.string()) }),
});
export type Explanation = z.infer<typeof Explanation>;

export const Stage = z.enum(["verify", "triage", "explain"]);
export const ModelCall = z.object({
  stage: Stage,
  model: z.string(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  reasoningTokens: z.number().int(),
  ms: z.number().int(),
  costUsd: z.number(),
  ok: z.boolean(),
  fallbackFrom: z.string().nullable(),
  ref: z.string().nullable(),
  at: z.string(),
});
export type ModelCall = z.infer<typeof ModelCall>;

export const PanelTotals = z.object({
  calls: z.number().int(),
  tokensByModel: z.record(z.string(), z.object({ input: z.number(), output: z.number(), reasoning: z.number(), costUsd: z.number(), calls: z.number() })),
  costUsd: z.number(),
  tavilyCredits: z.number(),
});
export type PanelTotals = z.infer<typeof PanelTotals>;

export const AnalysisStatus = z.enum(["queued", "discovering", "reading", "triaging", "explaining", "assembling", "done", "failed"]);
export type AnalysisStatus = z.infer<typeof AnalysisStatus>;

export const Analysis = z.object({
  analysisId: z.string(),
  placeId: z.string(),
  status: AnalysisStatus,
  progress: z.object({
    sourcesFound: z.number().int(),
    docsRead: z.number().int(),
    itemsTriaged: z.number().int(),
    itemsEscalated: z.number().int(),
    itemsExplained: z.number().int(),
  }),
  rejectedSources: z.array(z.object({ url: z.string(), reason: z.string() })),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  totals: PanelTotals,
  error: z.string().nullable(),
});
export type Analysis = z.infer<typeof Analysis>;

export const HeadlineItem = z.object({
  item: AgendaItem,
  meeting: Meeting,
  explanation: Explanation,
});
export type HeadlineItem = z.infer<typeof HeadlineItem>;

export const Briefing = z.object({
  placeId: z.string(),
  placeName: z.string(),
  state: z.string(),
  analysisId: z.string(),
  window: z.object({ from: z.string(), to: z.string() }),
  headlineItems: z.array(HeadlineItem),
  alsoOnAgenda: z.array(
    z.object({ number: z.string(), title: z.string(), docUrl: z.string(), page: z.number().int().nullable(), meetingId: z.string(), reason: RoutingReason, topic: Topic.optional(), itemHash: z.string().optional() }),
  ),
  meetings: z.array(Meeting),
  bodies: z.array(BodyRef),
  locatedItems: z.array(z.object({ itemHash: z.string(), lat: z.number(), lon: z.number(), placeText: z.string() })),
  panel: z.object({
    sourcesKept: z.array(z.object({ role: BodyRole, url: z.string(), platform: Platform })),
    sourcesRejected: z.array(z.object({ url: z.string(), reason: z.string() })),
    itemsTotal: z.number().int(),
    itemsTriaged: z.number().int(),
    itemsEscalated: z.number().int(),
    routingCounts: z.record(z.string(), z.number()),
    droppedStatements: z.number().int(),
    totals: PanelTotals,
  }),
  generatedAt: z.string(),
});
export type Briefing = z.infer<typeof Briefing>;

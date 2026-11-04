import type { InferOutput } from 'valibot'

import {
  array,
  boolean,
  fallback,
  finite,
  integer,
  isoTimestamp,
  literal,
  looseObject,
  maxLength,
  maxValue,
  minValue,
  nonEmpty,
  nullable,
  number,
  object,
  optional,
  picklist,
  pipe,
  string,
} from 'valibot'

/**
 * Message contracts of the companion state service, version 1.
 *
 * The service is the only writer of the companion state. Other processes talk
 * to it over MQTT with the inbound messages below. They read the result from
 * the retained state topic and the affect topic.
 *
 * Every inbound schema validates data that crosses a trust boundary, because
 * any client on the broker can publish on these topics.
 */

const Percent = pipe(number(), finite(), minValue(0), maxValue(100))
const Affection = pipe(number(), finite(), minValue(0), maxValue(1000))
const EventId = pipe(string(), nonEmpty(), maxLength(128))
const Timestamp = pipe(string(), isoTimestamp())
const ShortText = pipe(string(), maxLength(200))

/** Relationship modes. `companion` has no romantic progression and is the default. */
export const companionModes = ['companion', 'relationship', 'dating_sim'] as const
export type CompanionMode = (typeof companionModes)[number]

export const metricNames = ['affection', 'trust', 'intimacy', 'comfort', 'respect'] as const
export type MetricName = (typeof metricNames)[number]

/**
 * Five independent relationship axes.
 * `affection` uses 0..1000 so small steps stay visible. The other axes use 0..100.
 */
export const MetricsSchema = object({
  affection: Affection,
  trust: Percent,
  intimacy: Percent,
  comfort: Percent,
  respect: Percent,
})
export type RelationshipMetrics = InferOutput<typeof MetricsSchema>

/** Opt-in switches. A feature that needs consent does nothing while its switch is `false`. */
export const ConsentSchema = object({
  relationshipTracking: boolean(),
  romanticProgression: boolean(),
  proactiveSpeech: boolean(),
  screenObservation: boolean(),
  photoRetention: boolean(),
  timeDecay: boolean(),
})
export type Consent = InferOutput<typeof ConsentSchema>

const MoodStateSchema = object({
  /** Mood name as the existing NeoAlice mood system sent it, normalized to lower case. */
  primary: pipe(string(), nonEmpty(), maxLength(64)),
  /** `false` when the vocabulary table has no entry for `primary`. */
  known: boolean(),
  talkingheadMood: string(),
  airiEmotion: string(),
  /** `null` when the mood system did not report an intensity. The service never estimates it. */
  intensity: nullable(Percent),
  causes: array(ShortText),
  sourceSite: string(),
  sourceEventId: EventId,
  updatedAt: Timestamp,
})
export type MoodState = InferOutput<typeof MoodStateSchema>

/**
 * Persisted companion state. The file on disk must always match this schema.
 * The service refuses to start when it does not, so that a damaged file is never
 * replaced by an empty state.
 */
export const CompanionStateSchema = object({
  schemaVersion: literal(1),
  personaId: string(),
  ownerProfileId: string(),
  /** Increments only when a field that consumers read changes. */
  revision: pipe(number(), integer(), minValue(0)),
  updatedAt: Timestamp,
  mode: picklist(companionModes),
  consent: ConsentSchema,
  mood: nullable(MoodStateSchema),
  energy: object({
    value: Percent,
    /** `existing_ia` when the NeoAlice mood system reports energy. Then the local simulation stops. */
    source: picklist(['local_policy', 'existing_ia']),
    updatedAt: Timestamp,
  }),
  metrics: MetricsSchema,
  /** Change already applied today per metric, as absolute values. Resets on a new local date. */
  dailyMetricChange: object({
    localDate: nullable(string()),
    totals: MetricsSchema,
  }),
  time: object({
    firstMetAt: nullable(Timestamp),
    lastInteractionAt: nullable(Timestamp),
    totalInteractions: pipe(number(), integer(), minValue(0)),
    currentStreak: pipe(number(), integer(), minValue(0)),
    bestStreak: pipe(number(), integer(), minValue(0)),
    lastStreakLocalDate: nullable(string()),
  }),
  /** Event IDs already handled. Bounded. Used for idempotency across retries and reloads. */
  processedEventIds: array(string()),
  /** Interaction IDs that a proposal can still reference. Bounded. */
  recentInteractionIds: array(string()),
  /** Interaction IDs that already produced one applied proposal. Bounded. */
  usedProposalSources: array(string()),
})
export type CompanionState = InferOutput<typeof CompanionStateSchema>

/**
 * Mood message of the existing NeoAlice mood system, on `neoalice/v1/<site>/evt/mood`
 * or `neoalice/v1/<site>/cmd/evt/mood`.
 *
 * The producer sends `{ "mood": "happy" }` or `{ "state": { "mood": "happy" } }`.
 * Optional fields are read when present. An invalid optional field is dropped,
 * not the whole message, because the producer is outside this repository.
 */
export const MoodMessageSchema = looseObject({
  mood: fallback(optional(string()), undefined),
  state: fallback(optional(looseObject({ mood: fallback(optional(string()), undefined) })), undefined),
  intensity: fallback(optional(Percent), undefined),
  energy: fallback(optional(Percent), undefined),
  cause: fallback(optional(ShortText), undefined),
  causes: fallback(optional(pipe(array(ShortText), maxLength(10))), undefined),
  /** Producers set `origin` to mark their own messages. The service ignores messages with its own origin. */
  origin: fallback(optional(string()), undefined),
  eventId: fallback(optional(EventId), undefined),
})

/** Explicit end of a completed conversation turn, on `neoalice/v1/<site>/evt/companion/interaction`. */
export const InteractionMessageSchema = object({
  schemaVersion: literal(1),
  eventId: EventId,
  sessionId: optional(pipe(string(), maxLength(128))),
  /** An interrupted turn is recorded in the audit log but does not count. */
  interrupted: optional(boolean()),
})

/**
 * End of a conversation turn in the NeoAlice envelope, on `neoalice/v1/<site>/evt/dialog/turn_end`.
 * The NeoAlice backend does not publish it yet. The shape follows its other `v: 1` messages.
 * `turn_id` is the idempotency key. Only `status: "completed"` counts.
 */
export const TurnEndMessageSchema = looseObject({
  v: literal(1),
  type: optional(literal('evt.dialog.turn_end')),
  turn_id: optional(EventId),
  session_id: optional(pipe(string(), maxLength(128))),
  status: picklist(['completed', 'interrupted', 'cancelled', 'failed']),
})

const DeltaValue = pipe(number(), finite())

/**
 * Suggested metric change, on `neoalice/v1/<site>/cmd/companion/proposal`.
 * A heuristic or an LLM can send it. The service clamps and validates it.
 * It can never set a value directly.
 */
export const ProposalMessageSchema = object({
  schemaVersion: literal(1),
  eventId: EventId,
  /** The counted interaction that is the evidence for this proposal. */
  sourceEventId: EventId,
  suggestedDeltas: object({
    affection: optional(DeltaValue),
    trust: optional(DeltaValue),
    intimacy: optional(DeltaValue),
    comfort: optional(DeltaValue),
    respect: optional(DeltaValue),
  }),
  reason: optional(ShortText),
})

/** Mode and consent changes, on `neoalice/v1/<site>/cmd/companion/settings`. */
export const SettingsMessageSchema = object({
  schemaVersion: literal(1),
  eventId: EventId,
  mode: optional(picklist(companionModes)),
  consent: optional(object({
    relationshipTracking: optional(boolean()),
    romanticProgression: optional(boolean()),
    proactiveSpeech: optional(boolean()),
    screenObservation: optional(boolean()),
    photoRetention: optional(boolean()),
    timeDecay: optional(boolean()),
  })),
})

export const resetScopes = ['relationship', 'time', 'mood', 'energy', 'all'] as const
export type ResetScope = (typeof resetScopes)[number]

/** Scoped reset, on `neoalice/v1/<site>/cmd/companion/reset`. `confirm` must be `true`. */
export const ResetMessageSchema = object({
  schemaVersion: literal(1),
  eventId: EventId,
  scope: picklist(resetScopes),
  confirm: literal(true),
})

/** Validated input of the state reducer. The service clock sets `at`, not the sender. */
export type CompanionEvent
  = | {
    kind: 'mood'
    eventId: string
    at: Date
    site: string
    mood: string
    intensity?: number
    energy?: number
    causes: string[]
  }
  | {
    kind: 'interaction'
    eventId: string
    at: Date
    site: string
    origin: 'explicit' | 'derived'
    interrupted: boolean
  }
  | {
    kind: 'proposal'
    eventId: string
    at: Date
    sourceEventId: string
    deltas: Partial<RelationshipMetrics>
    reason?: string
  }
  | {
    kind: 'settings'
    eventId: string
    at: Date
    mode?: CompanionMode
    consent?: Partial<Consent>
  }
  | {
    kind: 'reset'
    eventId: string
    at: Date
    scope: ResetScope
  }

/** One audited decision. Rejected events are audited too, so a reader can see why nothing changed. */
export interface AuditEntry {
  at: string
  revision: number
  eventId: string
  kind: CompanionEvent['kind']
  outcome: 'applied' | 'unchanged' | 'rejected'
  reason?: string
  changes: Array<{ path: string, from: unknown, to: unknown }>
}

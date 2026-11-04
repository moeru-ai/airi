import type { InferOutput } from 'valibot'

import {
  array,
  boolean,
  check,
  finite,
  integer,
  literal,
  maxLength,
  maxValue,
  minLength,
  minValue,
  nonEmpty,
  number,
  object,
  optional,
  picklist,
  pipe,
  regex,
  safeParse,
  string,
} from 'valibot'

/**
 * Motion contracts, version 1 (Plan 01, section 5).
 *
 * An intent says what the character means to express. A cue says what the mixer
 * plays and when. An LLM, a voice service, or vision can send intents. Only the
 * scheduler creates cues. Nothing outside the scheduler writes bone rotations.
 */

/** Body regions that the mixer can own independently. One cue reserves one or more channels. */
export const motionChannels = ['locomotion', 'posture', 'torso', 'leftArm', 'rightArm', 'hands', 'head', 'gaze', 'facial', 'secondary'] as const
export type MotionChannel = (typeof motionChannels)[number]

/** Behavior states of the director. */
export const motionStates = ['idle', 'listening', 'thinking', 'speaking', 'walking', 'acting', 'interrupted'] as const
export type MotionState = (typeof motionStates)[number]

export const motionSources = ['llm', 'audio', 'vision', 'user', 'procedural', 'neural'] as const
export type MotionSource = (typeof motionSources)[number]

/** Largest serialized intent or cue. A bigger message is refused before parsing. */
export const maxMessageBytes = 4096

const Identifier = pipe(string(), nonEmpty(), maxLength(128))
const Milliseconds = pipe(number(), integer(), minValue(0))
const Unit = pipe(number(), finite(), minValue(0), maxValue(1))
/** Lower case snake case, for example `explain_left_hand`. The catalog decides which names exist. */
const SemanticAction = pipe(string(), maxLength(64), regex(/^[a-z][a-z0-9_]*$/, 'semanticAction must be lower snake case'))
const Channels = pipe(
  array(picklist(motionChannels)),
  maxLength(motionChannels.length),
  check(channels => new Set(channels).size === channels.length, 'channels must not repeat'),
)

export const MotionIntentSchema = object({
  schemaVersion: literal(1),
  /** Idempotency key. The scheduler drops a second intent with the same ID. */
  id: Identifier,
  timestampMs: Milliseconds,
  source: picklist(motionSources),
  /**
   * Conversation turn or session that owns the intent. An interruption cancels every
   * cue of the old session. Plan 01 requires this cancellation (sections 6 and 11),
   * so the field is part of version 1.
   */
  sessionId: optional(Identifier),
  state: optional(picklist(motionStates)),
  semanticAction: SemanticAction,
  emotion: optional(pipe(string(), maxLength(32))),
  intensity: optional(Unit),
  requestedChannels: optional(Channels),
  /** Start relative to the speech start. The scheduler aligns it to the audio that plays, not to the text. */
  offsetFromSpeechMs: optional(pipe(Milliseconds, maxValue(60_000))),
  requestedDurationMs: optional(pipe(Milliseconds, maxValue(60_000))),
  priority: optional(pipe(number(), integer(), minValue(0), maxValue(100))),
  interruptible: optional(boolean()),
})
export type MotionIntent = InferOutput<typeof MotionIntentSchema>

export const MotionCueSchema = pipe(
  object({
    id: Identifier,
    /** Clip from the motion catalog. Exactly one of `clipId` and `generatorId` is set. */
    clipId: optional(Identifier),
    /** Procedural or neural generator. Exactly one of `clipId` and `generatorId` is set. */
    generatorId: optional(Identifier),
    sessionId: optional(Identifier),
    /** On the render clock of the adapter, in milliseconds. */
    startAtMs: Milliseconds,
    weight: Unit,
    fadeInMs: pipe(Milliseconds, maxValue(10_000)),
    fadeOutMs: pipe(Milliseconds, maxValue(10_000)),
    mode: picklist(['normal', 'additive']),
    channels: pipe(Channels, minLength(1)),
    priority: pipe(number(), integer(), minValue(0), maxValue(100)),
    expiresAtMs: optional(Milliseconds),
  }),
  check(cue => (cue.clipId === undefined) !== (cue.generatorId === undefined), 'a cue needs exactly one of clipId and generatorId'),
  check(cue => cue.expiresAtMs === undefined || cue.expiresAtMs > cue.startAtMs, 'expiresAtMs must be after startAtMs'),
)
export type MotionCue = InferOutput<typeof MotionCueSchema>

export type ParseResult<T>
  = | { ok: true, value: T }
    | { ok: false, reason: string }

export interface ParseIntentOptions {
  /**
   * Semantic actions that the catalog knows. An intent with another action is refused.
   * Omit it only in tests and tools that check the shape alone.
   */
  allowedActions?: ReadonlySet<string>
}

/**
 * Validates an intent from any source. It never throws: an unknown or broken
 * command is refused with a reason, and the caller logs it and continues.
 */
export function parseMotionIntent(input: unknown, options: ParseIntentOptions = {}): ParseResult<MotionIntent> {
  const tooLarge = checkSize(input)
  if (tooLarge)
    return tooLarge

  const result = safeParse(MotionIntentSchema, input)
  if (!result.success)
    return { ok: false, reason: describeIssue(result.issues[0]) }
  if (options.allowedActions && !options.allowedActions.has(result.output.semanticAction))
    return { ok: false, reason: `semanticAction "${result.output.semanticAction}" is not in the catalog` }
  return { ok: true, value: result.output }
}

/** Validates a cue. The scheduler calls it before a cue reaches the adapter. */
export function parseMotionCue(input: unknown): ParseResult<MotionCue> {
  const tooLarge = checkSize(input)
  if (tooLarge)
    return tooLarge

  const result = safeParse(MotionCueSchema, input)
  if (!result.success)
    return { ok: false, reason: describeIssue(result.issues[0]) }
  return { ok: true, value: result.output }
}

function checkSize(input: unknown): { ok: false, reason: string } | undefined {
  let serialized: string | undefined
  try {
    serialized = JSON.stringify(input)
  }
  catch {
    return { ok: false, reason: 'message is not serializable' }
  }
  if (serialized === undefined)
    return { ok: false, reason: 'message is empty' }
  if (new TextEncoder().encode(serialized).length > maxMessageBytes)
    return { ok: false, reason: `message is larger than ${maxMessageBytes} bytes` }
  return undefined
}

function describeIssue(issue: { message: string, path?: Array<{ key: unknown }> }): string {
  const path = issue.path?.map(item => String(item.key)).join('.')
  return path ? `${path}: ${issue.message}` : issue.message
}

import type { TraceAggregate, TraceAttributeDefinition } from '../core/define'
import type { TraceAttributes, TraceRecord } from '../core/types'

import { clamp, mean, percentile as percentileOf, sum } from 'es-toolkit'

import { defineAttribute } from '../core/define'
import {
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_MEMORY_QUERY_TEXT,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
} from './semconv'

export * from './semconv'

/** Version of the conventions. Exports write it into their metadata. */
export const TRACE_CONVENTIONS_VERSION = '1'

/** Relations between records. Profiles add more. */
export const TraceLinkRelations = {
  CausedBy: 'caused-by',
  CancelledBy: 'cancelled-by',
  RetryOf: 'retry-of',
  Supersedes: 'supersedes',
  Revises: 'revises',
  FollowsFrom: 'follows-from',
  SameEntity: 'same-entity',
} as const

/** Common values of `span.end.reason`. The field is open. */
export const TraceEndReasons = {
  Interrupted: 'interrupted',
  Timeout: 'timeout',
  Superseded: 'superseded',
  Aborted: 'aborted',
  NoAudio: 'no-audio',
} as const

/** Kinds of pipeline edges. The field is open. */
export const TraceEdgeKinds = {
  Command: 'cmd',
  Data: 'data',
  Audio: 'audio',
  Signal: 'signal',
} as const

/** Attribute names of AIRI that apply to any domain. The `gen_ai.*` names are in `./semconv`. */
export const ATTR_PROVIDER_REQUEST_ID = 'provider.request_id' as const
export const ATTR_PROVIDER_RESPONSE_ID = 'provider.response_id' as const
export const ATTR_PROVIDER_ITEM_ID = 'provider.item_id' as const

export const ATTR_RETRY_COUNT = 'retry.count' as const
export const ATTR_FALLBACK_INDEX = 'fallback.index' as const

/** An interruption cut the measurement short. Percentiles leave it out. */
export const ATTR_CENSORED = 'censored' as const
/** A cold start. Percentiles leave it out. */
export const ATTR_WARMUP = 'warmup' as const

export const ATTR_DECISION_CHOICES = 'decision.choices' as const
export const ATTR_DECISION_VERDICT = 'decision.verdict' as const
export const ATTR_DECISION_P = 'decision.p' as const
export const ATTR_DECISION_THRESHOLD = 'decision.threshold' as const
export const ATTR_DECISION_REASON = 'decision.reason' as const
export const ATTR_DECISION_LATENCY_MS = 'decision.latency_ms' as const
export const ATTR_DECIDER = 'decider' as const

export const ATTR_MSG_KIND = 'msg.kind' as const
export const ATTR_MSG_NAME = 'msg.name' as const
export const ATTR_MSG_TO = 'msg.to' as const

export const ATTR_WORK_INTERRUPTIBLE = 'work.interruptible' as const

export const ATTR_STREAM_ID = 'stream.id' as const
export const ATTR_STREAM_START_FRAME = 'stream.start_frame' as const
export const ATTR_STREAM_END_FRAME = 'stream.end_frame' as const

/** The rule that decided a state change. */
export const ATTR_RULE = 'rule' as const
/** An external input to a policy. A replay harness feeds it to a new policy. */
export const ATTR_REPLAY_INPUT = 'replay.input' as const

/** Only the `conversation` ID key maps to `gen_ai.conversation.id`. The `topic` ID key maps to this attribute. */
export const ATTR_AIRI_TOPIC_ID = 'airi.topic.id' as const

/** Attribute definitions of the conventions. The content policy reads their sensitivity. */
export const conventionAttributes: TraceAttributeDefinition[] = [
  ATTR_GEN_AI_SYSTEM_INSTRUCTIONS,
  ATTR_GEN_AI_INPUT_MESSAGES,
  ATTR_GEN_AI_OUTPUT_MESSAGES,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_CALL_RESULT,
  ATTR_GEN_AI_MEMORY_QUERY_TEXT,
].map(key => defineAttribute({ key, type: 'json', sensitivity: 'content' }))

export interface ContentPolicy {
  /** Keeps `content` attributes. A developer setting turns it on for files on disk and exports. */
  keepContent: boolean
  /** The sensitivity of an attribute key. A key without a definition counts as `none`. */
  sensitivityOf: (key: string) => TraceAttributeDefinition['sensitivity'] | undefined
}

/**
 * Patterns of secret values. Tool arguments and provider errors can hold API keys, so the collector scrubs every
 * string attribute, also attributes that are not content.
 */
const SECRET_PATTERNS = [
  /\b(?:sk|pk|rk)-[\w-]{16,}/g,
  /\bBearer\s+[\w.~+/-]{16,}=*/gi,
  /\b(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*["']?[^\s"',}]{8,}/gi,
  /\bAKIA[0-9A-Z]{16}\b/g,
]

const SCRUBBED = '[secret]'

/**
 * Removes secrets from a string.
 *
 * @example
 * scrubSecrets('Authorization: Bearer abcdefghijklmnop1234')
 * // => 'Authorization: [secret]'
 */
export function scrubSecrets(text: string): string {
  let result = text
  for (const pattern of SECRET_PATTERNS)
    result = result.replace(pattern, SCRUBBED)
  return result
}

function applyToAttributes(attrs: TraceAttributes, policy: ContentPolicy): TraceAttributes | undefined {
  let changed = false
  const result: TraceAttributes = {}
  for (const [key, value] of Object.entries(attrs)) {
    const sensitivity = policy.sensitivityOf(key)
    if (sensitivity === 'secret' || (sensitivity === 'content' && !policy.keepContent)) {
      changed = true
      continue
    }
    if (typeof value === 'string') {
      const scrubbed = scrubSecrets(value)
      changed ||= scrubbed !== value
      result[key] = scrubbed
    }
    else if (Array.isArray(value) && value.some(item => typeof item === 'string')) {
      const scrubbed = (value as string[]).map(scrubSecrets)
      changed ||= scrubbed.some((item, index) => item !== value[index])
      result[key] = scrubbed
    }
    else {
      result[key] = value
    }
  }
  return changed ? result : undefined
}

/**
 * Applies the content policy to one record. The collector applies it before the buffer and before the disk.
 *
 * Returns the same object when nothing changes, so the common path does not copy.
 */
export function applyContentPolicy<T extends TraceRecord>(record: T, policy: ContentPolicy): T {
  let result = record
  if (record.attrs) {
    const attrs = applyToAttributes(record.attrs, policy)
    if (attrs)
      result = { ...result, attrs }
  }
  if (record.type === 'log') {
    const message = scrubSecrets(record.message)
    if (message !== record.message)
      result = { ...result, message }
  }
  if (record.type === 'span.end' && record.message) {
    const message = scrubSecrets(record.message)
    if (message !== record.message)
      result = { ...result, message }
  }
  return result
}

/** Fewest samples for a p95. A p95 of fewer samples is noise. */
const MIN_P95_SAMPLES = 100

/**
 * Computes the nearest-rank percentile of measurements.
 * Returns `undefined` for an empty list, and for p95 and p99 with fewer than 100 samples.
 */
export function percentile(values: readonly number[], p: number): number | undefined {
  // es-toolkit returns NaN for an empty list. The guard returns `undefined`, so a summary shows no value.
  if (values.length === 0 || (p >= 95 && values.length < MIN_P95_SAMPLES))
    return undefined
  // es-toolkit throws for a percentile outside 0 to 100. A clamp gives the minimum or the maximum instead.
  return percentileOf(values, clamp(p, 0, 100))
}

/** Aggregates measurements. A ratio metric gives sums, so its ratio is a ratio of sums, not a mean of ratios. */
export function aggregate(values: readonly number[], kinds: readonly TraceAggregate[]): Partial<Record<TraceAggregate, number>> {
  const result: Partial<Record<TraceAggregate, number>> = {}
  for (const kind of kinds) {
    switch (kind) {
      case 'p50':
        result.p50 = percentile(values, 50)
        break
      case 'p95':
        result.p95 = percentile(values, 95)
        break
      case 'p99':
        result.p99 = percentile(values, 99)
        break
      case 'mean':
        result.mean = values.length > 0 ? mean(values) : undefined
        break
      case 'sum':
        result.sum = sum(values)
        break
      case 'count':
        result.count = values.length
        break
    }
  }
  return result
}

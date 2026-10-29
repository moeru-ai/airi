import type { TraceAggregate, TraceAttributeDefinition } from '../core/define'
import type { TraceAttributes, TraceRecord } from '../core/types'

import { defineAttribute } from '../core/define'

/** Version of the conventions. Exports write it into their metadata. */
export const TRACE_CONVENTIONS_VERSION = '1'

/**
 * Commit of open-telemetry/semantic-conventions-genai that the `gen_ai.*` names follow.
 * The conventions have development stability, so the package pins one commit.
 */
export const GEN_AI_CONVENTIONS_COMMIT = '9ffc7e00c639be7712e544e3e54331e885dccf84'

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

/** Attribute names that apply to any domain. */
export const TraceAttributeNames = {
  GenAIOperationName: 'gen_ai.operation.name',
  GenAIProviderName: 'gen_ai.provider.name',
  GenAIRequestModel: 'gen_ai.request.model',
  GenAIResponseModel: 'gen_ai.response.model',
  GenAIConversationId: 'gen_ai.conversation.id',
  GenAIAgentId: 'gen_ai.agent.id',
  GenAIAgentName: 'gen_ai.agent.name',
  GenAIToolName: 'gen_ai.tool.name',
  GenAIToolCallId: 'gen_ai.tool.call.id',
  GenAIUsageInputTokens: 'gen_ai.usage.input_tokens',
  GenAIUsageOutputTokens: 'gen_ai.usage.output_tokens',
  GenAISystemInstructions: 'gen_ai.system_instructions',
  GenAIInputMessages: 'gen_ai.input.messages',
  GenAIOutputMessages: 'gen_ai.output.messages',
  GenAIToolCallArguments: 'gen_ai.tool.call.arguments',
  GenAIToolCallResult: 'gen_ai.tool.call.result',
  GenAIMemoryQueryText: 'gen_ai.memory.query.text',

  ProviderRequestId: 'provider.request_id',
  ProviderResponseId: 'provider.response_id',
  ProviderItemId: 'provider.item_id',

  RetryCount: 'retry.count',
  FallbackIndex: 'fallback.index',

  /** An interruption cut the measurement short. Percentiles leave it out. */
  Censored: 'censored',
  /** A cold start. Percentiles leave it out. */
  Warmup: 'warmup',

  DecisionChoices: 'decision.choices',
  DecisionVerdict: 'decision.verdict',
  DecisionP: 'decision.p',
  DecisionThreshold: 'decision.threshold',
  DecisionReason: 'decision.reason',
  DecisionLatencyMs: 'decision.latency_ms',
  Decider: 'decider',

  MsgKind: 'msg.kind',
  MsgName: 'msg.name',
  MsgTo: 'msg.to',

  WorkInterruptible: 'work.interruptible',

  StreamId: 'stream.id',
  StreamStartFrame: 'stream.start_frame',
  StreamEndFrame: 'stream.end_frame',

  /** The rule that decided a state change. */
  Rule: 'rule',
  /** An external input to a policy. A replay harness feeds it to a new policy. */
  ReplayInput: 'replay.input',

  /** Only the `conversation` ID key maps to `gen_ai.conversation.id`. The `topic` ID key maps to this attribute. */
  TopicId: 'airi.topic.id',
} as const

/** Attribute definitions of the conventions. The content policy reads their sensitivity. */
export const conventionAttributes: TraceAttributeDefinition[] = [
  TraceAttributeNames.GenAISystemInstructions,
  TraceAttributeNames.GenAIInputMessages,
  TraceAttributeNames.GenAIOutputMessages,
  TraceAttributeNames.GenAIToolCallArguments,
  TraceAttributeNames.GenAIToolCallResult,
  TraceAttributeNames.GenAIMemoryQueryText,
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
  if (values.length === 0 || (p >= 95 && values.length < MIN_P95_SAMPLES))
    return undefined
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length)
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]
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
        result.mean = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined
        break
      case 'sum':
        result.sum = values.reduce((sum, value) => sum + value, 0)
        break
      case 'count':
        result.count = values.length
        break
    }
  }
  return result
}

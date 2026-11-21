import type { AutoApprovalCard, AutoApprovalReviewReasonCode, AutoApprovalReviewRequest, AutoApprovalReviewResult, AutoApprovalReviewStage } from '../../../../shared/eventa/terminal-approval'
import type { AutoDecision } from './auto-policy'

import { sanitizeAutoApprovalCard } from '../../../../shared/auto-approval-review'
import { AUTO_REVIEW_CARD_MAX_BYTES, cardBytes } from './auto-policy'

/** Fast review deadline. A model refusal can still continue into thinking. */
export const AUTO_REVIEW_FAST_TIMEOUT_MS = 6_000
/** Thinking review deadline. The two stages together stay under 18 seconds. */
export const AUTO_REVIEW_THINKING_TIMEOUT_MS = 12_000

export type AutoReviewStage = AutoApprovalReviewStage
export type AutoReviewOutcome = AutoApprovalReviewResult

export interface AutoReviewVerdict {
  proceed: boolean
  reason: string
  stage?: AutoReviewStage
  reasonCode?: AutoApprovalReviewReasonCode
  detail?: string
}

export interface AutoReviewConsultation {
  decision: AutoDecision
  signal: AbortSignal
  /** Chat session whose loaded messages the reviewer reads. */
  sessionId: string
  /**
   * Turn and prepared action that own this review.
   * The cache key adds the card. Without this scope, consultAuto skips the cache.
   */
  cacheScope?: string
  /**
   * Host override for both stage deadlines.
   * @default undefined - each stage uses its own deadline.
   */
  timeoutMs?: number
  /**
   * Deadline for the fast stage.
   * @default AUTO_REVIEW_FAST_TIMEOUT_MS
   */
  fastTimeoutMs?: number
  /**
   * Deadline for the thinking stage.
   * @default AUTO_REVIEW_THINKING_TIMEOUT_MS
   */
  thinkingTimeoutMs?: number
  cacheGet: (key: string) => 'allow' | 'refuse' | undefined
  cacheSet: (key: string, verdict: 'allow' | 'refuse') => void
  /**
   * Runs one stage in the renderer.
   * A missing function refuses once and leaves the cache unchanged.
   */
  review?: (request: AutoApprovalReviewRequest, signal: AbortSignal) => Promise<AutoReviewOutcome>
}

/**
 * Applies one cage decision.
 * A model runs only for a new review card inside the current turn.
 * A model allow or refuse is cached for that turn.
 * A timeout, a parse failure, or a missing reviewer leaves the cache unchanged.
 * A model allow requires user text in the excerpt.
 * Thinking runs only after fast returns a model refusal and the excerpt has user text.
 */
export async function consultAuto(input: AutoReviewConsultation): Promise<AutoReviewVerdict> {
  if (input.decision.outcome === 'allow')
    return { proceed: true, reason: input.decision.reason }
  if (input.decision.outcome === 'refuse')
    return { proceed: false, reason: input.decision.reason }
  if (input.signal.aborted)
    return { proceed: false, reason: 'Auto approval ended before review.' }

  const card = input.decision.card
  const cardKey = JSON.stringify(card)
  const cacheKey = input.cacheScope ? `${input.cacheScope}\0${cardKey}` : undefined
  if (cardBytes(card) > AUTO_REVIEW_CARD_MAX_BYTES)
    return { proceed: false, reason: 'The action card is too long to review.' }
  if (cacheKey) {
    const cached = input.cacheGet(cacheKey)
    if (cached === 'allow')
      return { proceed: true, reason: 'A previous review allowed this action.' }
    if (cached === 'refuse')
      return { proceed: false, reason: 'A previous review refused this action.' }
  }
  if (!input.review)
    return { proceed: false, reason: 'Auto review could not complete.' }

  const fastTimeoutMs = input.fastTimeoutMs ?? input.timeoutMs ?? AUTO_REVIEW_FAST_TIMEOUT_MS
  const thinkingTimeoutMs = input.thinkingTimeoutMs ?? input.timeoutMs ?? AUTO_REVIEW_THINKING_TIMEOUT_MS
  const fast = await reviewStage(input, card, input.review, 'fast', fastTimeoutMs)
  if (fast === 'aborted')
    return { proceed: false, reason: 'Auto approval ended before review.' }
  if (fast === 'failed')
    return failClosed('fast')
  const fastVerdict = modelVerdict(fast)
  if (!fastVerdict) {
    logReview(fast)
    return failFromOutcome(fast)
  }
  if (fastVerdict === 'allow' && !fast.hasUserTranscript)
    return failClosed('fast')
  if (fastVerdict === 'allow')
    return storeVerdict(input, cacheKey, 'allow', fast, 'fast')
  if (!fast.hasUserTranscript)
    return storeVerdict(input, cacheKey, 'refuse', fast, 'fast')

  const thinking = await reviewStage(input, card, input.review, 'thinking', thinkingTimeoutMs)
  if (thinking === 'aborted')
    return { proceed: false, reason: 'Auto approval ended before review.' }
  if (thinking === 'failed')
    return failClosed('thinking')
  const thinkingVerdict = modelVerdict(thinking)
  if (!thinkingVerdict) {
    logReview(thinking)
    return failFromOutcome(thinking)
  }
  return storeVerdict(input, cacheKey, thinkingVerdict, thinking, 'thinking')
}

async function reviewStage(
  input: AutoReviewConsultation,
  card: AutoApprovalCard,
  review: NonNullable<AutoReviewConsultation['review']>,
  stage: AutoReviewStage,
  timeoutMs: number,
): Promise<AutoReviewOutcome | 'aborted' | 'failed'> {
  try {
    return await review({
      sessionId: input.sessionId,
      stage,
      card: sanitizeAutoApprovalCard(card),
    }, AbortSignal.any([input.signal, AbortSignal.timeout(timeoutMs)]))
  }
  catch {
    return input.signal.aborted ? 'aborted' : 'failed'
  }
}

function modelVerdict(outcome: AutoReviewOutcome): 'allow' | 'refuse' | undefined {
  if (outcome.reasonCode === 'model_allow' && outcome.decision === 'allow')
    return 'allow'
  if (outcome.reasonCode === 'model_refuse' && outcome.decision === 'refuse')
    return 'refuse'
  return undefined
}

function storeVerdict(
  input: AutoReviewConsultation,
  cacheKey: string | undefined,
  verdict: 'allow' | 'refuse',
  outcome: AutoReviewOutcome,
  stage?: AutoReviewStage,
): AutoReviewVerdict {
  if (input.signal.aborted)
    return { proceed: false, reason: 'Auto approval ended before review.' }
  logReview(outcome)
  if (cacheKey)
    input.cacheSet(cacheKey, verdict)
  return verdict === 'allow'
    ? {
        proceed: true,
        reason: 'Auto review allowed this action.',
        stage,
        reasonCode: outcome.reasonCode,
        ...(outcome.detail ? { detail: outcome.detail } : {}),
      }
    : {
        proceed: false,
        reason: 'Auto review refused this action.',
        stage,
        reasonCode: outcome.reasonCode,
        ...(outcome.detail ? { detail: outcome.detail } : {}),
      }
}

function failClosed(stage: AutoReviewStage): AutoReviewVerdict {
  return { proceed: false, reason: 'Auto review could not complete.', stage }
}

function failFromOutcome(outcome: AutoReviewOutcome): AutoReviewVerdict {
  return {
    proceed: false,
    reason: 'Auto review could not complete.',
    reasonCode: outcome.reasonCode,
    ...(outcome.detail ? { detail: outcome.detail } : {}),
  }
}

function logReview(outcome: AutoReviewOutcome) {
  if (outcome.reasonCode === 'parse_error' || outcome.reasonCode === 'unavailable')
    console.warn(`[auto-review] ${outcome.reasonCode}`)
}

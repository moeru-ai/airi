import type { AutoApprovalCard } from '../../../../shared/eventa/terminal-approval'
import type { AutoDecision } from './auto-policy'

import { AUTO_REVIEW_CARD_MAX_BYTES, cardBytes } from './auto-policy'

/** A review that does not finish within this time is a refusal. */
export const AUTO_REVIEW_TIMEOUT_MS = 12_000

export interface AutoReviewConsultation {
  decision: AutoDecision
  signal: AbortSignal
  timeoutMs?: number
  cacheGet: (card: string) => 'allow' | 'refuse' | undefined
  cacheSet: (card: string, verdict: 'allow' | 'refuse') => void
  review: (card: AutoApprovalCard, signal: AbortSignal) => Promise<'allow' | 'refuse'>
}

/**
 * Applies one cage decision. A model is called only for a new, short review card.
 * The same card during one Auto grant reuses the earlier verdict.
 */
export async function consultAuto(input: AutoReviewConsultation): Promise<{ proceed: boolean, reason: string }> {
  if (input.decision.outcome === 'allow')
    return { proceed: true, reason: input.decision.reason }
  if (input.decision.outcome === 'refuse')
    return { proceed: false, reason: input.decision.reason }
  if (input.signal.aborted)
    return { proceed: false, reason: 'Auto approval ended before review.' }
  const key = JSON.stringify(input.decision.card)
  if (cardBytes(input.decision.card) > AUTO_REVIEW_CARD_MAX_BYTES)
    return { proceed: false, reason: 'The action card is too long to review.' }
  const cached = input.cacheGet(key)
  if (cached === 'allow')
    return { proceed: true, reason: 'A previous review allowed this action.' }
  if (cached === 'refuse')
    return { proceed: false, reason: 'A previous review refused this action.' }
  let verdict: 'allow' | 'refuse' = 'refuse'
  try {
    const reviewed = await input.review(input.decision.card, AbortSignal.any([input.signal, AbortSignal.timeout(input.timeoutMs ?? AUTO_REVIEW_TIMEOUT_MS)]))
    verdict = reviewed === 'allow' ? 'allow' : 'refuse'
  }
  catch {
    if (input.signal.aborted)
      return { proceed: false, reason: 'Auto approval ended before review.' }
    verdict = 'refuse'
  }
  if (input.signal.aborted)
    return { proceed: false, reason: 'Auto approval ended before review.' }
  input.cacheSet(key, verdict)
  return {
    proceed: verdict === 'allow',
    reason: verdict === 'allow' ? 'Auto review allowed this action.' : 'Auto review refused this action.',
  }
}

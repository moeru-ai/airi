import type { Conversation } from '@proj-airi/core-agent'

import type { AutoApprovalReviewRequest, AutoApprovalReviewResult } from '../../../shared/eventa/terminal-approval'

import { autoApprovalReviewPrompt, buildAutoReviewTranscript, formatAutoReviewUserMessage, parseFastAutoReview, parseThinkingAutoReview, stripPairedReasoningBlocks } from '../../../shared/auto-approval-review'

export interface AutoApprovalReviewRunOptions {
  request: AutoApprovalReviewRequest
  signal: AbortSignal
  consciousnessConfigured: boolean
  messages: readonly unknown[]
  generateText: (conversation: Conversation, signal: AbortSignal) => Promise<string>
}

/**
 * Runs one Auto approval review stage in the renderer.
 * A missing consciousness model or an aborted signal throws so Main can fail closed.
 */
export async function runAutoApprovalReview(options: AutoApprovalReviewRunOptions): Promise<AutoApprovalReviewResult> {
  if (options.signal.aborted)
    throw options.signal.reason ?? new Error('Auto review was cancelled.')
  if (!options.consciousnessConfigured)
    throw new Error('Auto review needs a configured consciousness model.')
  const excerpt = buildAutoReviewTranscript(options.messages)
  const conversation: Conversation = { turns: [
    { id: 'auto-approval-instructions', type: 'system', authority: 'system', content: [{ type: 'text', text: autoApprovalReviewPrompt(options.request.card, options.request.stage) }] },
    { id: 'auto-approval-card', type: 'user', content: [{ type: 'text', text: formatAutoReviewUserMessage(options.request.card, excerpt.transcript) }] },
  ] }
  const reply = await options.generateText(conversation, options.signal)
  const cleaned = stripPairedReasoningBlocks(reply)
  const parsed = options.request.stage === 'fast' ? parseFastAutoReview(cleaned) : parseThinkingAutoReview(cleaned)
  return {
    decision: parsed.decision,
    reasonCode: parsed.reasonCode,
    hasUserTranscript: excerpt.hasUserTranscript,
    ...(parsed.detail ? { detail: parsed.detail } : {}),
  }
}

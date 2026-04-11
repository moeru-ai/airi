/**
 * Context compactor — auto-compresses conversation history when it exceeds
 * a token-count threshold.
 *
 * Strategy: When message count exceeds a configurable limit, compress older
 * messages into a summary while keeping the most recent messages intact.
 * This prevents context window overflow in long-running autonomous loops.
 */

import type { QueryMessage } from './types'

import { estimateTokenCount } from './tokenizer'

/** Estimate total tokens in a message array using the multi-heuristic tokenizer. */
export function estimateMessageTokens(messages: QueryMessage[]): number {
  return messages.reduce((sum, msg) => {
    const content = msg.role === 'assistant'
      ? (msg.content ?? '') + (msg.tool_calls ? JSON.stringify(msg.tool_calls) : '')
      : (msg.content ?? '')
    // +4 per message for role/separator overhead
    return sum + estimateTokenCount(content) + 4
  }, 0)
}

export interface CompactionConfig {
  /** Token threshold that triggers compaction. Default: 70% of maxTokenBudget. */
  compactThreshold: number
  /** Number of recent messages to preserve verbatim (never compacted). */
  preserveRecentCount: number
}

export interface CompactionResult {
  messages: QueryMessage[]
  compacted: boolean
  originalCount: number
  compactedCount: number
  estimatedTokensBefore: number
  estimatedTokensAfter: number
}

/**
 * Compact conversation history if estimated tokens exceed threshold.
 *
 * Algorithm:
 * 1. Keep the system message (messages[0]) always.
 * 2. Keep the last N messages verbatim (preserveRecentCount).
 * 3. Compress everything in between into a summary message.
 */
export function compactIfNeeded(
  messages: QueryMessage[],
  config: CompactionConfig,
): CompactionResult {
  const estimatedTokens = estimateMessageTokens(messages)

  if (estimatedTokens <= config.compactThreshold || messages.length <= config.preserveRecentCount + 2) {
    return {
      messages,
      compacted: false,
      originalCount: messages.length,
      compactedCount: messages.length,
      estimatedTokensBefore: estimatedTokens,
      estimatedTokensAfter: estimatedTokens,
    }
  }

  // Split: system | compactable | preserved
  const systemMessage = messages[0]! // Always system
  const preserveStart = Math.max(1, messages.length - config.preserveRecentCount)
  const toCompress = messages.slice(1, preserveStart)
  const toPreserve = messages.slice(preserveStart)

  // Build summary of compressed messages
  const summaryLines: string[] = [
    '=== Conversation History Summary ===',
    `(Summarized ${toCompress.length} messages to save context space)`,
    '',
  ]

  // Extract key actions and results from compressed messages
  for (const msg of toCompress) {
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      const toolNames = msg.tool_calls.map(tc => tc.function.name).join(', ')
      summaryLines.push(`• Called tools: ${toolNames}`)
      if (msg.content) {
        // Keep first 200 chars of assistant reasoning
        summaryLines.push(`  Reasoning: ${msg.content.slice(0, 200)}${msg.content.length > 200 ? '...' : ''}`)
      }
    }
    else if (msg.role === 'assistant' && msg.content) {
      summaryLines.push(`• Assistant: ${msg.content.slice(0, 300)}${msg.content.length > 300 ? '...' : ''}`)
    }
    else if (msg.role === 'tool') {
      // Keep first 150 chars of tool results
      const preview = msg.content.slice(0, 150)
      summaryLines.push(`  → Result: ${preview}${msg.content.length > 150 ? '...' : ''}`)
    }
    // Skip user messages in summary (they're usually tool results in agentic loops)
  }

  const summaryMessage: QueryMessage = {
    role: 'user',
    content: summaryLines.join('\n'),
  }

  const compactedMessages: QueryMessage[] = [
    systemMessage,
    summaryMessage,
    ...toPreserve,
  ]

  const estimatedTokensAfter = estimateMessageTokens(compactedMessages)

  return {
    messages: compactedMessages,
    compacted: true,
    originalCount: messages.length,
    compactedCount: compactedMessages.length,
    estimatedTokensBefore: estimatedTokens,
    estimatedTokensAfter,
  }
}

import type { Turn } from '../messages/types'
import type { ChatHistoryItem } from '../types/chat'
import type { ContextTokenCounter } from './context-budget'

/** One image costs about this much in provider requests. Its encoded bytes never count as text. */
const IMAGE_TOKEN_ESTIMATE = 1000

/** Serializes turns for counting, with each image replaced by a marker and counted apart. */
function serializeTurns(turns: Turn[]) {
  let images = 0
  const text = JSON.stringify(turns, (_key, value: unknown) => {
    if (typeof value === 'object' && value !== null && ((value as { type?: unknown }).type === 'image' || (value as { type?: unknown }).type === 'image_url')) {
      images += 1
      return '[image]'
    }
    return value
  })
  return { text, images }
}

/**
 * An upper bound of what projected turns cost, without a tokenizer.
 * One token covers at least one character of serialized text, so the character count bounds the token count.
 */
export function projectedTurnsSizeBound(turns: Turn[]) {
  const { text, images } = serializeTurns(turns)
  return text.length + images * IMAGE_TOKEN_ESTIMATE
}

/** Estimates what projected turns cost in a request, including tool calls, tool results, and transcripts. */
export function estimateTurnsTokens(turns: Turn[], countTokens: ContextTokenCounter) {
  const { text, images } = serializeTurns(turns)
  return countTokens(text) + images * IMAGE_TOKEN_ESTIMATE
}

/**
 * Finds the oldest message that still fits a token budget.
 *
 * Use when:
 * - A run projects its session history, and long sessions must not grow the prompt without bound.
 *
 * Expects:
 * - Messages in order, with the cost of each message's projection at the same index. System messages are left to the caller.
 *
 * Returns:
 * - The index of the first kept message. History is cut only before a user message, so a reply and its tool results stay together.
 *   The newest exchange always stays, even above the budget.
 */
export function fitHistoryToBudget(items: ChatHistoryItem[], costs: number[], maxTokens: number): number {
  const starts: number[] = []
  for (const [index, item] of items.entries()) {
    if (item.role === 'user' || starts.length === 0)
      starts.push(index)
  }

  let total = 0
  let firstKept = items.length
  for (let exchange = starts.length - 1; exchange >= 0; exchange -= 1) {
    const start = starts[exchange]!
    const end = starts[exchange + 1] ?? items.length
    const cost = costs.slice(start, end).reduce((sum, value) => sum + value, 0)
    if (exchange < starts.length - 1 && total + cost > maxTokens)
      break
    total += cost
    firstKept = start
  }
  return firstKept
}

import type { ChatHistoryItem } from '../types/chat'
import type { ContextTokenCounter } from './context-budget'

/** One image costs about this much in provider requests. Its encoded bytes never count as text. */
const IMAGE_TOKEN_ESTIMATE = 1000

function partTokens(part: unknown, countTokens: ContextTokenCounter): number {
  if (typeof part === 'string')
    return countTokens(part)
  if (typeof part !== 'object' || part === null)
    return 0
  const record = part as Record<string, unknown>
  if (record.type === 'image_url' || record.type === 'image')
    return IMAGE_TOKEN_ESTIMATE
  if (typeof record.text === 'string')
    return countTokens(record.text)
  return countTokens(JSON.stringify(record))
}

/** Estimates what one stored message costs in a request. Images count by a fixed estimate. */
export function estimateHistoryItemTokens(item: ChatHistoryItem, countTokens: ContextTokenCounter): number {
  const content = item.content as unknown
  const parts = Array.isArray(content) ? content : [content ?? '']
  let total = parts.reduce<number>((sum, part) => sum + partTokens(part, countTokens), 0)
  if (item.role === 'assistant') {
    for (const result of item.tool_results ?? [])
      total += partTokens(typeof result.result === 'string' ? result.result : JSON.stringify(result.result ?? ''), countTokens)
    for (const slice of item.slices ?? []) {
      if (slice.type === 'tool-call')
        total += partTokens(JSON.stringify(slice.toolCall), countTokens)
    }
  }
  return total
}

/** Result of fitting history into a budget. */
export interface HistoryBudgetResult {
  kept: ChatHistoryItem[]
  /** Older messages left out of the request, oldest first. */
  omitted: ChatHistoryItem[]
}

/**
 * Keeps the newest history that fits a token budget.
 *
 * Use when:
 * - A run projects its session history, and long sessions must not grow the prompt without bound.
 *
 * Expects:
 * - Messages in order. System messages are left to the caller.
 *
 * Returns:
 * - Kept and omitted messages. History is cut only before a user message, so a reply and its tool results stay together.
 *   The newest exchange always stays, even above the budget.
 */
export function fitHistoryToBudget(items: ChatHistoryItem[], countTokens: ContextTokenCounter, maxTokens: number): HistoryBudgetResult {
  const exchanges: ChatHistoryItem[][] = []
  for (const item of items) {
    if (item.role === 'user' || exchanges.length === 0)
      exchanges.push([item])
    else
      exchanges.at(-1)!.push(item)
  }

  let total = 0
  let firstKept = exchanges.length
  for (let index = exchanges.length - 1; index >= 0; index -= 1) {
    const cost = exchanges[index]!.reduce((sum, item) => sum + estimateHistoryItemTokens(item, countTokens), 0)
    if (index < exchanges.length - 1 && total + cost > maxTokens)
      break
    total += cost
    firstKept = index
  }

  return {
    kept: exchanges.slice(firstKept).flat(),
    omitted: exchanges.slice(0, firstKept).flat(),
  }
}

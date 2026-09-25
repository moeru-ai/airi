import type { ChatAssistantMessage, ChatSlices, ChatSlicesToolCallResult } from '../../../../types/chat'

/**
 * Pairs each call slice with its result by occurrence within that provider call id.
 * Inline results take precedence over stored results for the same occurrence.
 */
export function createToolCallResultLookup(
  slices: ChatSlices[],
  toolResults: ChatAssistantMessage['tool_results'] = [],
): Map<number, ChatSlicesToolCallResult> {
  const resultMap = new Map<number, ChatSlicesToolCallResult>()
  const occurrences = new Map<string, number>()
  for (const [index, slice] of slices.entries()) {
    if (slice.type !== 'tool-call')
      continue
    const id = slice.toolCall.toolCallId
    const occurrence = occurrences.get(id) ?? 0
    occurrences.set(id, occurrence + 1)
    const inline = slices.filter((item): item is ChatSlicesToolCallResult => item.type === 'tool-call-result' && item.id === id)[occurrence]
    const stored = toolResults.filter(item => item.id === id)[occurrence]
    if (inline)
      resultMap.set(index, inline)
    else if (stored)
      resultMap.set(index, { type: 'tool-call-result', ...stored })
  }
  return resultMap
}

/**
 * Resolves the visual state for a tool call block from its result.
 *
 * Use when:
 * - Tool call UI needs to show success or failure without replacing the assistant message
 *
 * Expects:
 * - Missing result means the call is still running
 *
 * Returns:
 * - `executing` for missing results, `error` for failed results, or `done` for successful results
 */
export function resolveToolCallBlockState(result: ChatSlicesToolCallResult | undefined): 'executing' | 'done' | 'error' {
  if (!result) {
    return 'executing'
  }

  return result.isError ? 'error' : 'done'
}

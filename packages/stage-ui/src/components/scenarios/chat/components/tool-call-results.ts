import type { ChatAssistantMessage, ChatSlices, ChatSlicesToolCallResult } from '../../../../types/chat'

/**
 * Creates a lookup from tool-call id to its latest result slice.
 *
 * Use when:
 * - Rendering assistant messages with separate `tool-call` and `tool-call-result` data
 * - Streaming messages store tool results on `tool_results` instead of inline slices
 *
 * Expects:
 * - Tool call ids use `toolCall.toolCallId`
 * - Tool result ids use `id`
 *
 * Returns:
 * - A map keyed by tool call id, preferring inline result slices over stored results
 */
export function createToolCallResultLookup(
  slices: ChatSlices[],
  toolResults: ChatAssistantMessage['tool_results'] = [],
): Map<string, ChatSlicesToolCallResult> {
  const resultMap = new Map<string, ChatSlicesToolCallResult>()

  for (const result of toolResults) {
    resultMap.set(result.id, {
      type: 'tool-call-result',
      ...result,
    })
  }

  for (const slice of slices) {
    if (slice.type === 'tool-call-result') {
      resultMap.set(slice.id, slice)
    }
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

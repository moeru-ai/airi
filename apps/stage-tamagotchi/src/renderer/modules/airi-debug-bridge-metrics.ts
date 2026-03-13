import type { StreamingAssistantMessage } from '@proj-airi/stage-ui/types/chat'
import type { ToolMessage } from '@xsai/shared-chat'

export interface ChatTurnToolMetrics {
  toolCallCount: number
  toolResultCount: number
}

export function countChatTurnToolMetrics(params: {
  output: StreamingAssistantMessage
  toolMessages: ToolMessage[]
}): ChatTurnToolMetrics {
  const toolCallIds = new Set<string>()
  const toolResultIds = new Set<string>()
  let anonymousToolCallCount = 0
  let anonymousToolResultCount = 0

  for (const slice of params.output.slices) {
    if (slice.type !== 'tool-call') {
      continue
    }

    const toolCallId = slice.toolCall?.toolCallId?.trim()
    if (toolCallId) {
      toolCallIds.add(toolCallId)
      continue
    }

    anonymousToolCallCount += 1
  }

  for (const toolResult of params.output.tool_results) {
    const toolCallId = toolResult.id?.trim()
    if (toolCallId) {
      toolCallIds.add(toolCallId)
      toolResultIds.add(toolCallId)
      continue
    }

    anonymousToolResultCount += 1
  }

  for (const toolMessage of params.toolMessages) {
    const toolCallId = toolMessage.tool_call_id?.trim()
    if (toolCallId) {
      toolCallIds.add(toolCallId)
      toolResultIds.add(toolCallId)
      continue
    }

    anonymousToolResultCount += 1
  }

  return {
    toolCallCount: toolCallIds.size + Math.max(anonymousToolCallCount, anonymousToolResultCount),
    toolResultCount: toolResultIds.size + anonymousToolResultCount,
  }
}

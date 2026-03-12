import type { StreamingAssistantMessage } from '@proj-airi/stage-ui/types/chat'
import type { ToolMessage } from '@xsai/shared-chat'

import { describe, expect, it } from 'vitest'

import { countChatTurnToolMetrics } from './airi-debug-bridge-metrics'

function createStreamingAssistantMessage(overrides: Partial<StreamingAssistantMessage> = {}): StreamingAssistantMessage {
  return {
    role: 'assistant',
    content: '',
    slices: [],
    tool_results: [],
    ...overrides,
  }
}

describe('countChatTurnToolMetrics', () => {
  it('counts tool calls from assistant slices when manual tool loop does not persist tool messages', () => {
    const output = createStreamingAssistantMessage({
      slices: [
        {
          type: 'tool-call',
          toolCall: {
            args: '{}',
            toolCallId: 'tc-1',
            toolCallType: 'function',
            toolName: 'mcp_call_tool',
          },
        },
      ],
      tool_results: [{ id: 'tc-1', result: 'ok' }],
    })

    expect(countChatTurnToolMetrics({
      output,
      toolMessages: [],
    })).toEqual({
      toolCallCount: 1,
      toolResultCount: 1,
    })
  })

  it('counts current-turn tool results from tool messages when the output payload omits tool_results', () => {
    const output = createStreamingAssistantMessage()
    const toolMessages = [
      {
        role: 'tool',
        tool_call_id: 'tc-1',
        content: 'done',
      },
      {
        role: 'tool',
        tool_call_id: 'tc-2',
        content: 'done',
      },
    ] satisfies ToolMessage[]

    expect(countChatTurnToolMetrics({
      output,
      toolMessages,
    })).toEqual({
      toolCallCount: 2,
      toolResultCount: 2,
    })
  })

  it('deduplicates the same tool call across assistant slices, tool_results, and tool messages', () => {
    const output = createStreamingAssistantMessage({
      slices: [
        {
          type: 'tool-call',
          toolCall: {
            args: '{}',
            toolCallId: 'tc-1',
            toolCallType: 'function',
            toolName: 'mcp_call_tool',
          },
        },
      ],
      tool_results: [{ id: 'tc-1', result: 'ok' }],
    })

    const toolMessages = [
      {
        role: 'tool',
        tool_call_id: 'tc-1',
        content: 'ok',
      },
    ] satisfies ToolMessage[]

    expect(countChatTurnToolMetrics({
      output,
      toolMessages,
    })).toEqual({
      toolCallCount: 1,
      toolResultCount: 1,
    })
  })
})

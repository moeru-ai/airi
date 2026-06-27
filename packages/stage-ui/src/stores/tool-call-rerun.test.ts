import type { Tool } from '@xsai/shared-chat'

import type { ChatAssistantMessage, ChatHistoryItem } from '../types/chat'

import { describe, expect, it, vi } from 'vitest'

import { executeToolCallRerun, replaceToolCallResult } from './tool-call-rerun'

function assistantMessage(overrides: Partial<ChatAssistantMessage> = {}): ChatAssistantMessage {
  return {
    role: 'assistant',
    content: '',
    slices: [
      {
        type: 'tool-call',
        toolCall: {
          toolCallId: 'call-weather',
          toolCallType: 'function',
          toolName: 'weather',
          args: JSON.stringify({ location: 'Tokyo' }),
        },
      },
    ],
    tool_results: [],
    ...overrides,
  }
}

function tool(name: string, execute: Tool['execute']): Tool {
  return {
    type: 'function',
    function: {
      name,
      description: `${name} description`,
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    execute,
  }
}

describe('replaceToolCallResult', () => {
  it('replaces stored tool_results by id', () => {
    const message = assistantMessage({
      content: 'assistant content',
      tool_results: [
        { id: 'call-weather', result: 'old weather' },
        { id: 'call-news', result: 'news' },
      ],
    })

    const next = replaceToolCallResult(message, {
      id: 'call-weather',
      result: 'new weather',
    })

    expect(next).not.toBe(message)
    expect(next.content).toBe('assistant content')
    expect(next.tool_results).toEqual([
      { id: 'call-news', result: 'news' },
      { id: 'call-weather', result: 'new weather' },
    ])
  })

  it('replaces matching inline tool-call-result slice', () => {
    const message = assistantMessage({
      slices: [
        {
          type: 'tool-call',
          toolCall: {
            toolCallId: 'call-weather',
            toolCallType: 'function',
            toolName: 'weather',
            args: JSON.stringify({ location: 'Tokyo' }),
          },
        },
        {
          type: 'tool-call-result',
          id: 'call-weather',
          result: 'old weather',
        },
      ],
    })

    const next = replaceToolCallResult(message, {
      id: 'call-weather',
      isError: true,
      result: 'new error',
    })

    expect(next.slices).toEqual([
      message.slices[0],
      {
        type: 'tool-call-result',
        id: 'call-weather',
        isError: true,
        result: 'new error',
      },
    ])
    expect(next.tool_results).toEqual([
      {
        id: 'call-weather',
        isError: true,
        result: 'new error',
      },
    ])
  })
})

describe('executeToolCallRerun', () => {
  it('executes the matching tool and writes the result', async () => {
    const execute = vi.fn<Tool['execute']>(async () => 'clear skies')
    const targetMessage: ChatHistoryItem = {
      ...assistantMessage(),
      id: 'assistant-1',
    }
    const messages: ChatHistoryItem[] = [
      { role: 'user', content: 'weather?', id: 'user-1' },
      { role: 'error', content: 'previous runtime error', id: 'error-1' },
      targetMessage,
    ]

    const next = await executeToolCallRerun({
      messages,
      payload: {
        messageId: 'assistant-1',
        toolCallId: 'call-weather',
        toolName: 'weather',
        args: '{ "location": "Tokyo" }',
      },
      resolveTools: async () => [tool('weather', execute)],
    })

    expect(execute).toHaveBeenCalledWith({ location: 'Tokyo' }, {
      toolCallId: 'call-weather',
      messages,
    })
    expect(next).not.toBe(messages)
    expect(next[2]).toMatchObject({
      tool_results: [
        {
          id: 'call-weather',
          result: 'clear skies',
        },
      ],
    })
  })

  it('writes an error result when the tool is unavailable', async () => {
    const messages: ChatHistoryItem[] = [
      {
        ...assistantMessage(),
        id: 'assistant-1',
      },
    ]

    const next = await executeToolCallRerun({
      messages,
      payload: {
        messageId: 'assistant-1',
        toolCallId: 'call-weather',
        toolName: 'weather',
        args: '{}',
      },
      resolveTools: async () => [],
    })

    expect(next[0]).toMatchObject({
      tool_results: [
        {
          id: 'call-weather',
          isError: true,
          result: 'Tool "weather" is not available for rerun in this runtime.',
        },
      ],
    })
  })

  it('writes an error result for invalid JSON args', async () => {
    const execute = vi.fn<Tool['execute']>(async () => 'unused')
    const resolveTools = vi.fn<() => Promise<Tool[]>>(async () => [tool('weather', execute)])
    const messages: ChatHistoryItem[] = [
      {
        ...assistantMessage(),
        id: 'assistant-1',
      },
    ]

    const next = await executeToolCallRerun({
      messages,
      payload: {
        messageId: 'assistant-1',
        toolCallId: 'call-weather',
        toolName: 'weather',
        args: '{ invalid',
      },
      resolveTools,
    })

    expect(resolveTools).toHaveBeenCalledTimes(1)
    expect(execute).not.toHaveBeenCalled()
    expect(next[0]).toMatchObject({
      tool_results: [
        {
          id: 'call-weather',
          isError: true,
        },
      ],
    })
    expect((next[0] as ChatAssistantMessage).tool_results[0]?.result).toContain('Invalid tool call arguments JSON:')
  })

  it('writes an error result when the tool throws', async () => {
    const messages: ChatHistoryItem[] = [
      {
        ...assistantMessage(),
        id: 'assistant-1',
      },
    ]

    const next = await executeToolCallRerun({
      messages,
      payload: {
        messageId: 'assistant-1',
        toolCallId: 'call-weather',
        toolName: 'weather',
        args: '',
      },
      resolveTools: async () => [tool('weather', async () => {
        throw new Error('network unavailable')
      })],
    })

    expect(next[0]).toMatchObject({
      tool_results: [
        {
          id: 'call-weather',
          isError: true,
          result: 'Tool call error for "weather": network unavailable',
        },
      ],
    })
  })
})

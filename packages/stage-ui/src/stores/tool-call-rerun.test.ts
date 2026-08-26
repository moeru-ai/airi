import type { Tool } from '@xsai/shared-chat'

import type { ChatAssistantMessage, ChatHistoryItem } from '../types/chat'

import { describe, expect, it, vi } from 'vitest'

import { executeToolCallRerun, replaceToolCallResult } from './tool-call-rerun'

function assistantMessage(overrides: Partial<ChatAssistantMessage> = {}): ChatAssistantMessage {
  return {
    content: '',
    role: 'assistant',
    slices: [
      {
        toolCall: {
          args: JSON.stringify({ location: 'Tokyo' }),
          toolCallId: 'call-weather',
          toolCallType: 'function',
          toolName: 'weather',
        },
        type: 'tool-call',
      },
    ],
    tool_results: [],
    ...overrides,
  }
}

function tool(name: string, execute: Tool['execute']): Tool {
  return {
    execute,
    function: {
      description: `${name} description`,
      name,
      parameters: {
        properties: {},
        type: 'object',
      },
    },
    type: 'function',
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
          toolCall: {
            args: JSON.stringify({ location: 'Tokyo' }),
            toolCallId: 'call-weather',
            toolCallType: 'function',
            toolName: 'weather',
          },
          type: 'tool-call',
        },
        {
          id: 'call-weather',
          result: 'old weather',
          type: 'tool-call-result',
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
        id: 'call-weather',
        isError: true,
        result: 'new error',
        type: 'tool-call-result',
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

  it('replaces the matching tool message in the provider transcript', () => {
    const message = assistantMessage({
      providerTranscript: [
        {
          content: '',
          role: 'assistant',
          tool_calls: [
            {
              function: { arguments: '{}', name: 'weather' },
              id: 'call-weather',
              type: 'function',
            },
          ],
        },
        {
          content: 'old weather',
          role: 'tool',
          tool_call_id: 'call-weather',
        },
        {
          content: 'The old result was returned.',
          role: 'assistant',
        },
      ],
    })

    const next = replaceToolCallResult(message, {
      id: 'call-weather',
      result: 'new weather',
    })

    expect(next.providerTranscript?.[1]).toEqual({
      content: 'new weather',
      role: 'tool',
      tool_call_id: 'call-weather',
    })
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
      { content: 'weather?', id: 'user-1', role: 'user' },
      { content: 'previous runtime error', id: 'error-1', role: 'error' },
      targetMessage,
    ]

    const next = await executeToolCallRerun({
      messages,
      payload: {
        args: '{ "location": "Tokyo" }',
        messageId: 'assistant-1',
        toolCallId: 'call-weather',
        toolName: 'weather',
      },
      resolveTools: async () => [tool('weather', execute)],
    })

    expect(execute).toHaveBeenCalledWith({ location: 'Tokyo' }, {
      messages,
      toolCallId: 'call-weather',
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
        args: '{}',
        messageId: 'assistant-1',
        toolCallId: 'call-weather',
        toolName: 'weather',
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
        args: '{ invalid',
        messageId: 'assistant-1',
        toolCallId: 'call-weather',
        toolName: 'weather',
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
        args: '',
        messageId: 'assistant-1',
        toolCallId: 'call-weather',
        toolName: 'weather',
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

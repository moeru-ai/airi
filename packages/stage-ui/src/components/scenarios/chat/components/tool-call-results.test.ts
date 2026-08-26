import type { ChatAssistantMessage } from '../../../../types/chat'

import { describe, expect, it } from 'vitest'

import { createToolCallResultLookup, resolveToolCallBlockState } from './tool-call-results'

describe('tool call result lookup', () => {
  /**
   * @example
   * expect(resolveToolCallBlockState(undefined)).toBe('executing')
   */
  it('marks a tool call without a result as executing', () => {
    expect(resolveToolCallBlockState(undefined)).toBe('executing')
  })

  /**
   * @example
   * expect(resolveToolCallBlockState(result)).toBe('done')
   */
  it('marks a successful tool result as done', () => {
    const message: ChatAssistantMessage = {
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
        {
          id: 'call-weather',
          result: 'Tokyo is clear with light wind.',
          type: 'tool-call-result',
        },
      ],
      tool_results: [],
    }

    const lookup = createToolCallResultLookup(message.slices, message.tool_results)
    const result = lookup.get('call-weather')

    expect(result?.result).toBe('Tokyo is clear with light wind.')
    expect(resolveToolCallBlockState(result)).toBe('done')
  })

  /**
   * @example
   * expect(resolveToolCallBlockState(result)).toBe('error')
   */
  it('pairs a failed tool result with its tool call id', () => {
    const message: ChatAssistantMessage = {
      content: '',
      role: 'assistant',
      slices: [
        {
          toolCall: {
            args: JSON.stringify({ mode: 'new', side: 'white' }),
            toolCallId: 'call-play-chess',
            toolCallType: 'function',
            toolName: 'play_chess',
          },
          type: 'tool-call',
        },
      ],
      tool_results: [
        {
          id: 'call-play-chess',
          isError: true,
          result: 'Focus mode does not accept game-state mutation inputs.',
        },
      ],
    }

    const lookup = createToolCallResultLookup(message.slices, message.tool_results)
    const result = lookup.get('call-play-chess')

    expect(result?.result).toBe('Focus mode does not accept game-state mutation inputs.')
    expect(resolveToolCallBlockState(result)).toBe('error')
  })
})

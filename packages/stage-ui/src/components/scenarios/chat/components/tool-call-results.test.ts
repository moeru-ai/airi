import type { ChatAssistantMessage } from '../../../../types/chat'

import { describe, expect, it } from 'vitest'

import { createToolCallResultLookup, resolveToolCallBlockState } from './tool-call-results'

describe('tool call result lookup', () => {
  // https://github.com/moeru-ai/airi/pull/2477
  it('pairs repeated provider call ids by occurrence (PR #2477)', () => {
    // ROOT CAUSE:
    // A map keyed only by call id assigned the last result to every matching block.
    // Slice positions distinguish occurrences while inline results retain precedence.
    const message: ChatAssistantMessage = {
      role: 'assistant',
      content: '',
      slices: [0, 1].map(() => ({ type: 'tool-call', toolCall: { toolCallId: 'same', toolCallType: 'function', toolName: 'weather', args: '{}' } })),
      tool_results: [{ id: 'same', result: 'first' }, { id: 'same', result: 'second' }],
    }
    const lookup = createToolCallResultLookup(message.slices, message.tool_results)
    expect(lookup.get(0)?.result).toBe('first')
    expect(lookup.get(1)?.result).toBe('second')
  })

  it('marks a tool call without a result as executing', () => {
    expect(resolveToolCallBlockState(undefined)).toBe('executing')
  })

  it('marks a successful tool result as done', () => {
    const message: ChatAssistantMessage = {
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
        {
          type: 'tool-call-result',
          id: 'call-weather',
          result: 'Tokyo is clear with light wind.',
        },
      ],
      tool_results: [],
    }

    const lookup = createToolCallResultLookup(message.slices, message.tool_results)
    const result = lookup.get(0)

    expect(result?.result).toBe('Tokyo is clear with light wind.')
    expect(resolveToolCallBlockState(result)).toBe('done')
  })

  it('pairs a failed tool result with its tool call id', () => {
    const message: ChatAssistantMessage = {
      role: 'assistant',
      content: '',
      slices: [
        {
          type: 'tool-call',
          toolCall: {
            toolCallId: 'call-play-chess',
            toolCallType: 'function',
            toolName: 'play_chess',
            args: JSON.stringify({ mode: 'new', side: 'white' }),
          },
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
    const result = lookup.get(0)

    expect(result?.result).toBe('Focus mode does not accept game-state mutation inputs.')
    expect(resolveToolCallBlockState(result)).toBe('error')
  })
})

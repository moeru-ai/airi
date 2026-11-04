import type { Tool } from '@xsai/shared-chat'

import type { UserTurn } from '../messages/types'
import type { ChatHistoryItem } from '../types/chat'

import { describe, expect, it } from 'vitest'

import {
  estimateHistoryItemTokens,
  estimateSegmentTokens,
  estimateTextTokens,
  estimateToolTokens,
  estimateTurnTokens,
  isContextLengthExceededError,
  truncateToolResultContent,
} from './token-estimator'

describe('token-estimator', () => {
  it('estimates empty and whitespace strings as zero', () => {
    expect(estimateTextTokens('')).toBe(0)
    expect(estimateTextTokens(null)).toBe(0)
    expect(estimateTextTokens(undefined)).toBe(0)
  })

  it('estimates English text conservatively', () => {
    // 14 characters / 3.5 = 4
    expect(estimateTextTokens('Hello, world!!')).toBe(4)
  })

  it('estimates CJK text accurately', () => {
    // 4 CJK chars
    expect(estimateTextTokens('你好世界')).toBe(4)
    // Mixed: 4 CJK + 6 non-CJK (6 / 3.5 = 1.71) => 4 + 2 = 6
    expect(estimateTextTokens('你好世界 hello')).toBe(6)
  })

  it('estimates message segments', () => {
    expect(estimateSegmentTokens({ type: 'text', text: 'sample text' })).toBeGreaterThan(0)
    expect(estimateSegmentTokens({ type: 'tool-call', callId: '1', name: 'search', arguments: '{"q":"airi"}' })).toBeGreaterThan(10)
    expect(estimateSegmentTokens({ type: 'image', url: 'https://example.com/1.png', detail: 'high' })).toBe(1000)
    expect(estimateSegmentTokens({ type: 'image', url: 'https://example.com/2.png', detail: 'low' })).toBe(256)
  })

  it('estimates user and assistant turns', () => {
    const turn: UserTurn = {
      type: 'user',
      id: 'turn-1',
      content: [{ type: 'text', text: 'Hello assistant' }],
    }
    expect(estimateTurnTokens(turn)).toBeGreaterThan(4)
  })

  it('estimates tool definitions', () => {
    const tool: Tool = {
      type: 'function',
      function: {
        name: 'calculator',
        description: 'Performs basic arithmetic operations',
        parameters: {
          type: 'object',
          properties: {
            expression: { type: 'string', description: 'The math expression' },
          },
          required: ['expression'],
        },
      },
      execute: () => '42',
    }
    expect(estimateToolTokens(tool)).toBeGreaterThan(20)
  })

  it('estimates chat history items', () => {
    const item: ChatHistoryItem = {
      role: 'user',
      content: 'Can you help me?',
      id: 'user-1',
    }
    expect(estimateHistoryItemTokens(item)).toBeGreaterThan(4)
  })

  it('truncates oversized tool result content safely', () => {
    const longText = 'a'.repeat(10000)
    const result = truncateToolResultContent(longText, 500)
    expect(result.truncated).toBe(true)
    expect(result.text).toContain('[... truncated')
    expect(result.text.length).toBeLessThan(longText.length)

    const shortText = 'Small output'
    const shortResult = truncateToolResultContent(shortText, 500)
    expect(shortResult.truncated).toBe(false)
    expect(shortResult.text).toBe(shortText)
  })

  it('identifies provider context length exceeded errors', () => {
    expect(isContextLengthExceededError(new Error('context_length_exceeded: maximum context length is 8192'))).toBe(true)
    expect(isContextLengthExceededError(new Error('This model maximum context length is 4096 tokens'))).toBe(true)
    expect(isContextLengthExceededError(new Error('Prompt is too long'))).toBe(true)
    expect(isContextLengthExceededError(new Error('Network timeout'))).toBe(false)
  })
})

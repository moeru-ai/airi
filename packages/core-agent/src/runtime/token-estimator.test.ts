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

  // https://github.com/moeru-ai/airi/issues/3335
  //
  // ROOT CAUSE:
  //
  // CJK tool results with characters between maxTokens and 3*maxTokens were not truncated
  // because keepChars was calculated as maxTokens * 3, assuming 3 characters per token.
  //
  // const keepChars = Math.max(100, Math.floor(maxTokens * 3))
  // if (keepChars >= content.length) return { text: content, truncated: false, truncatedChars: 0 }
  //
  // We fixed this by using binary search with estimateTextTokens to find the prefix that fits the token budget.
  it('bounds CJK tool result truncation by estimated tokens for Issue #3335', () => {
    const cjkText = '测'.repeat(1000)
    const result = truncateToolResultContent(cjkText, 500)
    expect(result.truncated).toBe(true)
    expect(result.truncatedChars).toBeGreaterThan(0)
    expect(estimateTextTokens(result.text)).toBeLessThanOrEqual(500)
  })

  // https://github.com/moeru-ai/airi/issues/3335
  //
  // ROOT CAUSE:
  //
  // Multimodal history attachments were charged a flat 65 tokens for every non-text part,
  // undercounting images (256/1000 tokens) and audio (128 tokens) before trimming.
  //
  // for (const part of item.content) {
  //   if (part.type === 'text') tokens += estimateTextTokens(part.text)
  //   else tokens += 65
  // }
  //
  // We fixed this by applying media-specific token estimates to history content parts.
  it('applies media token estimates to history attachments for Issue #3335', () => {
    const imageHigh: ChatHistoryItem = {
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: 'https://example.com/img.png', detail: 'high' } }],
    }
    expect(estimateHistoryItemTokens(imageHigh)).toBeGreaterThanOrEqual(1000)

    const audioItem: ChatHistoryItem = {
      role: 'user',
      content: [{ type: 'audio', audio: {} } as any],
    }
    expect(estimateHistoryItemTokens(audioItem)).toBeGreaterThanOrEqual(128)
  })

  // https://github.com/moeru-ai/airi/issues/3335
  //
  // ROOT CAUSE:
  //
  // Assistant history items with generationTranscript or providerTranscript but without
  // duplicate tool_results were estimated based only on visible text, ignoring tool outputs.
  //
  // We fixed this by estimating tokens from generationTranscript or providerTranscript when present.
  it('counts transcript-backed history in token budget for Issue #3335', () => {
    const assistantWithTranscript: ChatHistoryItem = {
      role: 'assistant',
      content: 'Brief summary',
      slices: [],
      tool_results: [],
      providerTranscript: [
        { role: 'assistant', content: 'Calling tool' },
        { role: 'tool', tool_call_id: 'call-1', content: 'Detailed tool output '.repeat(50) },
      ],
    }
    expect(estimateHistoryItemTokens(assistantWithTranscript)).toBeGreaterThan(200)
  })

  it('identifies provider context length exceeded errors', () => {
    expect(isContextLengthExceededError(new Error('context_length_exceeded: maximum context length is 8192'))).toBe(true)
    expect(isContextLengthExceededError(new Error('This model maximum context length is 4096 tokens'))).toBe(true)
    expect(isContextLengthExceededError(new Error('Prompt is too long'))).toBe(true)
    expect(isContextLengthExceededError(new Error('Network timeout'))).toBe(false)
  })
})

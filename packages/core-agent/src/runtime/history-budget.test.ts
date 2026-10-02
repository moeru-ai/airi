import type { ChatHistoryItem } from '../types/chat'

import { describe, expect, it } from 'vitest'

import { estimateHistoryItemTokens, fitHistoryToBudget } from './history-budget'

// One token per character keeps the arithmetic visible.
const countTokens = (text: string) => text.length

function user(id: string, content: string): ChatHistoryItem {
  return { role: 'user', content, id }
}

function assistant(id: string, content: string): ChatHistoryItem {
  return { role: 'assistant', content, id, slices: [], tool_results: [] }
}

describe('history budget', () => {
  // P7 acceptance: prompt size stays bounded.
  it('drops the oldest exchanges first and keeps replies with their questions', () => {
    const history = [user('u1', 'aaaaaaaaaa'), assistant('a1', 'bbbbbbbbbb'), user('u2', 'cccccccccc'), assistant('a2', 'dddddddddd'), user('u3', 'eeeee')]

    const result = fitHistoryToBudget(history, countTokens, 30)

    expect(result.kept.map(item => item.id)).toEqual(['u2', 'a2', 'u3'])
    expect(result.omitted.map(item => item.id)).toEqual(['u1', 'a1'])
  })

  it('keeps the newest exchange even above the budget', () => {
    const result = fitHistoryToBudget([user('u1', 'short'), user('u2', 'x'.repeat(100))], countTokens, 10)

    expect(result.kept.map(item => item.id)).toEqual(['u2'])
  })

  it('counts an image by a fixed estimate, not by its encoded bytes', () => {
    const withImage: ChatHistoryItem = { role: 'user', id: 'img', content: [{ type: 'text', text: 'look' }, { type: 'image_url', image_url: { url: `data:image/png;base64,${'A'.repeat(50_000)}` } }] }

    expect(estimateHistoryItemTokens(withImage, countTokens)).toBe(4 + 1000)
  })
})

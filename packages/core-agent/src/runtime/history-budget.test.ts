import type { Turn } from '../messages/types'
import type { ChatHistoryItem } from '../types/chat'

import { describe, expect, it } from 'vitest'

import { estimateTurnsTokens, fitHistoryToBudget, projectedTurnsSizeBound } from './history-budget'

// One token per character keeps the arithmetic visible.
const countTokens = (text: string) => text.length

function user(id: string): ChatHistoryItem {
  return { role: 'user', content: id, id }
}

function assistant(id: string): ChatHistoryItem {
  return { role: 'assistant', content: id, id, slices: [], tool_results: [] }
}

describe('history budget', () => {
  // P7 acceptance: prompt size stays bounded.
  it('drops the oldest exchanges first and keeps replies with their questions', () => {
    const history = [user('u1'), assistant('a1'), user('u2'), assistant('a2'), user('u3')]

    expect(fitHistoryToBudget(history, [10, 10, 10, 10, 5], 30)).toBe(2)
  })

  it('keeps the newest exchange even above the budget', () => {
    expect(fitHistoryToBudget([user('u1'), user('u2')], [5, 100], 10)).toBe(1)
  })

  it('counts an image by a fixed estimate, not by its encoded bytes', () => {
    const turns: Turn[] = [{ type: 'user', id: 'img', content: [{ type: 'text', text: 'look' }, { type: 'image', url: `data:image/png;base64,${'A'.repeat(50_000)}` }] }]

    expect(estimateTurnsTokens(turns, countTokens)).toBeLessThan(1200)
    expect(projectedTurnsSizeBound(turns)).toBeLessThan(1200)
  })

  // ROOT CAUSE:
  //
  // The quick check measured only message text, while the request also sent tool results and turn transcripts.
  // A 25,000-token tool result passed a 100-token budget.
  //
  // We fixed this by pricing what each message projects.
  it('prices tool results that the projection sends', () => {
    const turns: Turn[] = [{
      type: 'assistant',
      id: 'a1',
      status: 'completed',
      rounds: [{ id: 'round', content: [], toolInvocations: [{ id: 'call', callId: 'call', name: 'search', arguments: '{}', execution: { status: 'succeeded', output: [{ type: 'text', text: 'x'.repeat(25_000) }] } }], projectionIssues: [] }],
    }]

    expect(estimateTurnsTokens(turns, countTokens)).toBeGreaterThan(25_000)
    expect(projectedTurnsSizeBound(turns)).toBeGreaterThan(25_000)
  })
})

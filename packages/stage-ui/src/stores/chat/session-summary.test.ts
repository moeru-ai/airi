import { describe, expect, it } from 'vitest'

import { summarizeSessionMessages } from './session-summary'

describe('summarizeSessionMessages', () => {
  it('keeps the first and the last message with text, and the time of the last message', () => {
    expect(summarizeSessionMessages([
      { role: 'system', content: 'Rules', createdAt: 1 },
      { role: 'user', content: 'Hi', createdAt: 2 },
      { role: 'assistant', content: 'Hello  there', slices: [], tool_results: [], createdAt: 3 },
      { role: 'error', content: 'Failed', createdAt: 4 },
    ])).toEqual({ firstText: 'Hi', lastText: 'Hello there', lastFromUser: false, lastAt: 3 })
  })

  it('marks a last message of the user and shortens a long text', () => {
    const summary = summarizeSessionMessages([{ role: 'user', content: 'a'.repeat(200), createdAt: 5 }])

    expect(summary.lastFromUser).toBe(true)
    expect(summary.lastText).toHaveLength(121)
    expect(summary.lastText?.endsWith('…')).toBe(true)
  })

  it('gives an empty summary to a conversation without messages', () => {
    expect(summarizeSessionMessages([])).toEqual({})
  })
})

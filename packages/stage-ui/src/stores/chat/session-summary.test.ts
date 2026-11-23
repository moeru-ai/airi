import { describe, expect, it } from 'vitest'

import { summarizeSessionMessages, summaryOfRemoteChat } from './session-summary'

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

describe('summaryOfRemoteChat', () => {
  const chat = { id: 'chat', type: 'bot' as const, title: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', members: [] }

  it('reads the first and the last message that the server lists', () => {
    expect(summaryOfRemoteChat({ ...chat, firstMessageText: 'Hi', lastMessageText: 'Hello', lastMessageRole: 'user', lastMessageAt: '2026-01-02T00:00:00.000Z' }))
      .toEqual({ firstText: 'Hi', lastText: 'Hello', lastFromUser: true, lastAt: Date.parse('2026-01-02T00:00:00.000Z') })
  })

  it('shortens a long text as the local summary does', () => {
    expect(summaryOfRemoteChat({ ...chat, lastMessageText: 'a'.repeat(200) }).lastText).toHaveLength(121)
  })

  it('gives an empty summary to a chat that an API without summaries lists', () => {
    expect(summaryOfRemoteChat(chat)).toEqual({})
  })
})

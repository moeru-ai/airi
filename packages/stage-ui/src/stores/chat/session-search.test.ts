import type { ChatHistoryItem } from '../../types/chat'

import { describe, expect, it } from 'vitest'

import { normalizeSessionQuery, searchSessions } from './session-search'

function user(content: string): ChatHistoryItem {
  return { role: 'user', content, createdAt: 1 }
}

function assistant(text: string): ChatHistoryItem {
  return { role: 'assistant', content: text, slices: [{ type: 'text', text }], tool_results: [], createdAt: 2 }
}

describe('normalizeSessionQuery', () => {
  it('trims, joins white space, and lowers the case', () => {
    expect(normalizeSessionQuery('  Moon \n  Trip ')).toBe('moon trip')
  })
})

describe('searchSessions', () => {
  it('matches nothing for an empty or blank query', () => {
    const sources = [{ sessionId: 'a', title: 'Trip', messages: [user('hello')] }]
    expect(searchSessions('', sources).size).toBe(0)
    expect(searchSessions('   ', sources).size).toBe(0)
  })

  it('finds a query in a message regardless of case, with the newest match as the snippet', () => {
    const matches = searchSessions('MOON', [{
      sessionId: 'a',
      title: 'Trip',
      messages: [user('first moon'), assistant('The Moon is far'), user('thanks')],
    }])
    expect(matches.get('a')).toEqual({
      snippet: { before: 'The ', match: 'Moon', after: ' is far', fromUser: false },
    })
  })

  it('shortens the text before a match that sits deep in a long message', () => {
    const text = `${'a'.repeat(40)} moon after`
    const snippet = searchSessions('moon', [{ sessionId: 'a', title: 'Trip', messages: [user(text)] }]).get('a')?.snippet
    expect(snippet?.before).toBe(`…${'a'.repeat(15)} `)
    expect(snippet?.match).toBe('moon')
    expect(snippet?.fromUser).toBe(true)
  })

  it('matches a title when no message matches, and when the conversation has no messages on the device', () => {
    const matches = searchSessions('trip', [
      { sessionId: 'loaded', title: 'Moon trip', messages: [user('hello')] },
      { sessionId: 'remote', title: 'Trip notes' },
    ])
    expect(matches.get('loaded')).toEqual({})
    expect(matches.get('remote')).toEqual({})
  })

  it('skips system messages and conversations without a match', () => {
    const matches = searchSessions('secret', [
      { sessionId: 'a', title: 'Trip', messages: [{ role: 'system', content: 'secret prompt', createdAt: 0 }] },
      { sessionId: 'b', title: 'Other', messages: [user('nothing here')] },
    ])
    expect(matches.size).toBe(0)
  })

  it('matches Chinese text and text across collapsed white space', () => {
    const matches = searchSessions('去 月球', [{ sessionId: 'a', title: '旅行', messages: [user('我们一起去\n  月球吧')] }])
    expect(matches.get('a')?.snippet).toEqual({ before: '我们一起', match: '去 月球', after: '吧', fromUser: true })
  })
})

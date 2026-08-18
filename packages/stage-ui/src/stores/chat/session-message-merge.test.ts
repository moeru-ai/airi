import type { ChatHistoryItem } from '../../types/chat'

import { describe, expect, it } from 'vitest'

import { mergeLoadedSessionMessages } from './session-message-merge'

describe('mergeLoadedSessionMessages', () => {
  it('keeps stored history when the in-memory session only has the placeholder system message', () => {
    const storedMessages: ChatHistoryItem[] = [
      { role: 'system', content: 'system', createdAt: 1, id: 'system-stored' },
      { role: 'assistant', content: 'saved reply', createdAt: 2, id: 'assistant-1', slices: [], tool_results: [] },
    ]
    const currentMessages: ChatHistoryItem[] = [
      { role: 'system', content: 'system', createdAt: 3, id: 'system-current' },
    ]

    expect(mergeLoadedSessionMessages(storedMessages, currentMessages)).toBe(storedMessages)
  })

  it('appends in-flight messages when IndexedDB finishes loading after a new send starts', () => {
    const storedMessages: ChatHistoryItem[] = [
      { role: 'system', content: 'system', createdAt: 1, id: 'system-stored' },
      { role: 'assistant', content: 'older reply', createdAt: 2, id: 'assistant-1', slices: [], tool_results: [] },
    ]
    const currentMessages: ChatHistoryItem[] = [
      { role: 'system', content: 'system', createdAt: 3, id: 'system-current' },
      { role: 'user', content: 'latest prompt', createdAt: 4, id: 'user-2' },
    ]

    expect(mergeLoadedSessionMessages(storedMessages, currentMessages)).toEqual([
      ...storedMessages,
      currentMessages[1],
    ])
  })

  it('does not duplicate messages that are already present in storage', () => {
    const storedMessages: ChatHistoryItem[] = [
      { role: 'system', content: 'system', createdAt: 1, id: 'system-stored' },
      { role: 'user', content: 'latest prompt', createdAt: 4 },
    ]
    const currentMessages: ChatHistoryItem[] = [
      { role: 'system', content: 'system', createdAt: 3, id: 'system-current' },
      { role: 'user', content: 'latest prompt', createdAt: 4 },
    ]

    expect(mergeLoadedSessionMessages(storedMessages, currentMessages)).toBe(storedMessages)
  })

  it('keeps a system message when storage is empty and current has in-flight user messages', () => {
    const storedMessages: ChatHistoryItem[] = []
    const currentMessages: ChatHistoryItem[] = [
      { role: 'system', content: 'system from memory', createdAt: 1, id: 'system-current' },
      { role: 'user', content: 'in-flight prompt', createdAt: 2, id: 'user-1' },
    ]

    expect(mergeLoadedSessionMessages(storedMessages, currentMessages)).toEqual([
      currentMessages[0],
      currentMessages[1],
    ])
  })

  it('uses flattened array text for deduplication fingerprints', () => {
    const storedMessages: ChatHistoryItem[] = [
      { role: 'system', content: 'system', createdAt: 1, id: 'system' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'hello' },
          { type: 'text', text: ' world' },
        ],
        createdAt: 5,
      },
    ]

    const currentMessages: ChatHistoryItem[] = [
      { role: 'system', content: 'system', createdAt: 2, id: 'system-memory' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'hello world' },
        ],
        createdAt: 5,
      },
    ]

    expect(mergeLoadedSessionMessages(storedMessages, currentMessages)).toBe(storedMessages)
  })
})

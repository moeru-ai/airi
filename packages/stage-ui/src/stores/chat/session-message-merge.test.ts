import assert from 'node:assert/strict'

import type { ChatHistoryItem } from '../../types/chat'

import { describe, it } from 'vitest'

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

    assert.equal(mergeLoadedSessionMessages(storedMessages, currentMessages), storedMessages)
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

    assert.deepEqual(mergeLoadedSessionMessages(storedMessages, currentMessages), [
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

    assert.equal(mergeLoadedSessionMessages(storedMessages, currentMessages), storedMessages)
  })
})

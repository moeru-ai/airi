import assert from 'node:assert/strict'

import { describe, it } from 'vitest'

import { getChatHistoryItemKey } from './message-key.ts'

describe('getChatHistoryItemKey', () => {
  it('prefers stable message ids when available', () => {
    const createdAt = 1700000000000

    assert.equal(getChatHistoryItemKey({ role: 'user', content: 'hi', createdAt, id: 'user-1' }, 0), 'user-1')
    assert.equal(getChatHistoryItemKey({ role: 'assistant', content: 'hello', createdAt, id: 'assistant-1' }, 1), 'assistant-1')
  })

  it('falls back to a role + timestamp + index composite when ids are missing', () => {
    const createdAt = 1700000000000

    assert.equal(getChatHistoryItemKey({ role: 'user', content: 'hi', createdAt }, 0), 'user:1700000000000:0')
    assert.equal(getChatHistoryItemKey({ role: 'assistant', content: 'hello', createdAt }, 1), 'assistant:1700000000000:1')
  })
  it('falls back to index when message is missing', () => {
    assert.equal(getChatHistoryItemKey(undefined, 0), 0)
    assert.equal(getChatHistoryItemKey(undefined, 1), 1)
  })

  it('falls back to a role + index composite when ids and timestamps are missing', () => {
    assert.equal(getChatHistoryItemKey({ role: 'user', content: 'hi' }, 0), 'user:0')
    assert.equal(getChatHistoryItemKey({ role: 'assistant', content: 'hello' }, 1), 'assistant:1')
  })
})

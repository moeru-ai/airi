import type { ChatHistoryItem } from '../../../types/chat'

import assert from 'node:assert/strict'

import { describe, it } from 'vitest'

import { getChatHistoryItemKey } from './utils'

describe('getChatHistoryItemKey', () => {
  it('prefers stable message ids when available', () => {
    const createdAt = 1700000000000

    const userMessage: ChatHistoryItem = { role: 'user', content: 'hi', createdAt, id: 'user-1' }
    const assistantMessage: ChatHistoryItem = { role: 'assistant', content: 'hello', createdAt, id: 'assistant-1', slices: [], tool_results: [] }

    assert.equal(getChatHistoryItemKey(userMessage, 0), 'user-1')
    assert.equal(getChatHistoryItemKey(assistantMessage, 1), 'assistant-1')
  })

  it('falls back to a role + timestamp + index composite when ids are missing', () => {
    const createdAt = 1700000000000

    const userMessage: ChatHistoryItem = { role: 'user', content: 'hi', createdAt }
    const assistantMessage: ChatHistoryItem = { role: 'assistant', content: 'hello', createdAt, slices: [], tool_results: [] }

    assert.equal(getChatHistoryItemKey(userMessage, 0), 'user:1700000000000:0')
    assert.equal(getChatHistoryItemKey(assistantMessage, 1), 'assistant:1700000000000:1')
  })

  it('falls back to index when message is missing', () => {
    assert.equal(getChatHistoryItemKey(undefined, 0), 0)
    assert.equal(getChatHistoryItemKey(undefined, 1), 1)
  })

  it('falls back to a role + index composite when ids and timestamps are missing', () => {
    const userMessage: ChatHistoryItem = { role: 'user', content: 'hi' }
    const assistantMessage: ChatHistoryItem = { role: 'assistant', content: 'hello', slices: [], tool_results: [] }

    assert.equal(getChatHistoryItemKey(userMessage, 0), 'user:0')
    assert.equal(getChatHistoryItemKey(assistantMessage, 1), 'assistant:1')
  })
})

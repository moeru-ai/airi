import type { ChatHistoryItem } from '../../../types/chat'

import { describe, expect, it } from 'vitest'

import { getChatHistoryItemKey } from './utils'

describe('getChatHistoryItemKey', () => {
  it('prefers stable message ids when available', () => {
    const createdAt = 1700000000000

    const userMessage: ChatHistoryItem = { content: 'hi', createdAt, id: 'user-1', role: 'user' }
    const assistantMessage: ChatHistoryItem = { content: 'hello', createdAt, id: 'assistant-1', role: 'assistant', slices: [], tool_results: [] }

    expect(getChatHistoryItemKey(userMessage, 0)).toBe('user-1')
    expect(getChatHistoryItemKey(assistantMessage, 1)).toBe('assistant-1')
  })

  it('falls back to a role + timestamp + index composite when ids are missing', () => {
    const createdAt = 1700000000000

    const userMessage: ChatHistoryItem = { content: 'hi', createdAt, role: 'user' }
    const assistantMessage: ChatHistoryItem = { content: 'hello', createdAt, role: 'assistant', slices: [], tool_results: [] }

    expect(getChatHistoryItemKey(userMessage, 0)).toBe('user:1700000000000:0')
    expect(getChatHistoryItemKey(assistantMessage, 1)).toBe('assistant:1700000000000:1')
  })

  it('falls back to index when message is missing', () => {
    expect(getChatHistoryItemKey(undefined, 0)).toBe(0)
    expect(getChatHistoryItemKey(undefined, 1)).toBe(1)
  })

  it('falls back to a role + index composite when ids and timestamps are missing', () => {
    const userMessage: ChatHistoryItem = { content: 'hi', role: 'user' }
    const assistantMessage: ChatHistoryItem = { content: 'hello', role: 'assistant', slices: [], tool_results: [] }

    expect(getChatHistoryItemKey(userMessage, 0)).toBe('user:0')
    expect(getChatHistoryItemKey(assistantMessage, 1)).toBe('assistant:1')
  })
})

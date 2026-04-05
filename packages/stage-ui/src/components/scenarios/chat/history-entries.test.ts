import type { ChatHistoryItem } from '../../../types/chat'

import { describe, expect, it } from 'vitest'

import { buildChatHistoryEntries } from './history-entries'

function createUserMessage(content: string, createdAt?: number): ChatHistoryItem {
  return {
    role: 'user',
    content,
    createdAt,
  }
}

function createAssistantMessage(content: string, createdAt?: number): ChatHistoryItem {
  return {
    role: 'assistant',
    content,
    createdAt,
    slices: [],
    tool_results: [],
  }
}

describe('buildChatHistoryEntries', () => {
  it('skips timestamp separators when chat messages do not expose timestamps', () => {
    const messages: ChatHistoryItem[] = [
      createUserMessage('Hello'),
      createAssistantMessage('Hi there'),
    ]

    expect(buildChatHistoryEntries(messages)).toEqual([
      {
        type: 'message',
        message: messages[0],
        index: 0,
      },
      {
        type: 'message',
        message: messages[1],
        index: 1,
      },
    ])
  })

  it('adds a timestamp separator before the first timestamped message', () => {
    const createdAt = new Date('2026-04-04T09:00:00').getTime()
    const messages: ChatHistoryItem[] = [
      createUserMessage('Hello', createdAt),
      createAssistantMessage('Hi there', createdAt + 5_000),
    ]

    expect(buildChatHistoryEntries(messages)).toEqual([
      {
        type: 'timestamp',
        timestamp: createdAt,
      },
      {
        type: 'message',
        message: messages[0],
        index: 0,
      },
      {
        type: 'message',
        message: messages[1],
        index: 1,
      },
    ])
  })

  it('adds another timestamp separator after a 30 minute gap', () => {
    const base = new Date('2026-04-04T09:00:00').getTime()
    const afterGap = base + (35 * 60 * 1000)
    const messages: ChatHistoryItem[] = [
      createUserMessage('Hello', base),
      createAssistantMessage('Hi there', base + 5_000),
      createUserMessage('I am back', afterGap),
    ]

    expect(buildChatHistoryEntries(messages)).toEqual([
      {
        type: 'timestamp',
        timestamp: base,
      },
      {
        type: 'message',
        message: messages[0],
        index: 0,
      },
      {
        type: 'message',
        message: messages[1],
        index: 1,
      },
      {
        type: 'timestamp',
        timestamp: afterGap,
      },
      {
        type: 'message',
        message: messages[2],
        index: 2,
      },
    ])
  })

  it('adds a timestamp separator when the day changes even within 30 minutes', () => {
    const beforeMidnight = new Date('2026-04-04T23:50:00').getTime()
    const afterMidnight = new Date('2026-04-05T00:05:00').getTime()
    const messages: ChatHistoryItem[] = [
      createUserMessage('Late night thought', beforeMidnight),
      createAssistantMessage('Still here', afterMidnight),
    ]

    expect(buildChatHistoryEntries(messages)).toEqual([
      {
        type: 'timestamp',
        timestamp: beforeMidnight,
      },
      {
        type: 'message',
        message: messages[0],
        index: 0,
      },
      {
        type: 'timestamp',
        timestamp: afterMidnight,
      },
      {
        type: 'message',
        message: messages[1],
        index: 1,
      },
    ])
  })
})

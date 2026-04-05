import type { Message } from '@xsai/shared-chat'

import type { ChatHistoryItem } from '../../types/chat'

import { describe, expect, it } from 'vitest'

import { normalizeHistoryItemForPrompt, stripPromptMetadata } from './prompt-messages'

describe('prompt-messages', () => {
  it('keeps error entries in prompt rebuilds by converting them to user text', () => {
    const message: ChatHistoryItem = {
      role: 'error',
      content: 'Connection lost while sending the message',
      createdAt: 1_700_000_000_000,
    }

    expect(normalizeHistoryItemForPrompt(message)).toEqual({
      role: 'user',
      content: 'User encountered error: Connection lost while sending the message',
      createdAt: 1_700_000_000_000,
    })
  })

  it('drops assistant-only UI fields while preserving createdAt for timestamp injection', () => {
    const message: ChatHistoryItem = {
      role: 'assistant',
      content: 'Recovered response',
      slices: [],
      tool_results: [],
      categorization: {
        speech: 'spoken',
        reasoning: 'reasoned',
      },
      createdAt: 1_700_000_000_123,
    }

    expect(normalizeHistoryItemForPrompt(message)).toEqual({
      role: 'assistant',
      content: 'Recovered response',
      createdAt: 1_700_000_000_123,
    })
  })

  it('strips createdAt before provider send', () => {
    const message = {
      role: 'user',
      content: 'Hello again',
      createdAt: 1_700_000_000_456,
    } satisfies TimestampedMessage

    expect(stripPromptMetadata(message)).toEqual({
      role: 'user',
      content: 'Hello again',
    })
  })
})

type TimestampedMessage = Message & { createdAt?: number }

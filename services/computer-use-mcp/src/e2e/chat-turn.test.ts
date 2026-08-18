import { describe, expect, it } from 'vitest'

import { hasCompletedChatTurn } from './chat-turn'

describe('hasCompletedChatTurn', () => {
  it('treats tool-only turns as completed even without assistant text', () => {
    expect(hasCompletedChatTurn({
      chat: {
        lastTurnComplete: {
          at: '2026-03-10T12:50:39.178Z',
          outputText: '',
          toolCallCount: 13,
          toolResultCount: 13,
        },
      },
    })).toBe(true)
  })

  it('treats text output turns as completed', () => {
    expect(hasCompletedChatTurn({
      chat: {
        lastTurnComplete: {
          outputText: 'hello from AIRI',
          toolCallCount: 0,
          toolResultCount: 0,
        },
      },
    })).toBe(true)
  })

  it('ignores snapshots without a completed turn summary', () => {
    expect(hasCompletedChatTurn({
      chat: {
        lastTurnComplete: null,
      },
    })).toBe(false)

    expect(hasCompletedChatTurn({
      chat: {
        lastTurnComplete: {
          outputText: '',
          toolCallCount: 0,
          toolResultCount: 0,
        },
      },
    })).toBe(false)
  })
})

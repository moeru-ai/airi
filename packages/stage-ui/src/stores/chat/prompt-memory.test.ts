import type { MemoryPromptContext } from '../../services/memory/gateway'

import { describe, expect, it } from 'vitest'

import { createMemoryGateway } from '../../services/memory/gateway'
import { formatMemoryPromptText, readMemoryPromptText } from './prompt-memory'

function createPromptContext(overrides: Partial<MemoryPromptContext> = {}): MemoryPromptContext {
  return {
    memoryCards: [],
    profileSummary: 'Summary line',
    recentTurns: [
      {
        createdAt: 1000,
        role: 'user',
        text: 'hello',
        turnId: 'turn-1',
      },
      {
        createdAt: 2000,
        role: 'assistant',
        text: 'hi there',
        turnId: 'turn-2',
      },
    ],
    schemaVersion: 1,
    scope: {
      characterId: 'character-a',
      sessionId: 'session-a',
      userId: 'user-a',
    },
    stableFacts: [
      {
        confidence: 0.8,
        id: 'fact-1',
        key: 'name',
        value: 'Airi',
      },
      {
        confidence: 0.7,
        id: 'fact-2',
        key: 'hobby',
        value: 'music',
      },
    ],
    ...overrides,
  }
}

describe('memory prompt helper', () => {
  it('formats memory sections in fixed order: profile summary, stable facts, recent turns', () => {
    const text = formatMemoryPromptText(createPromptContext())

    expect(text.startsWith('[Memory]')).toBe(true)
    expect(text.indexOf('[Profile Summary]')).toBeLessThan(text.indexOf('[Stable Facts]'))
    expect(text.indexOf('[Stable Facts]')).toBeLessThan(text.indexOf('[Recent Turns]'))
    expect(text).toContain('Summary line')
    expect(text).toContain('- name: Airi')
    expect(text).toContain('- hobby: music')
    expect(text).toContain('- user: hello')
    expect(text).toContain('- assistant: hi there')
  })

  it('stays stable when summary, facts, or turns are empty', async () => {
    const gateway = {
      appendTurn: async () => ({ schemaVersion: 1, storedTurnId: 'turn-1', syncCheckpoint: 0 }),
      getSyncState: async () => ({ schemaVersion: 1, scope: createPromptContext().scope, syncState: null }),
      readPromptContext: async () => createPromptContext({
        profileSummary: null,
        recentTurns: [],
        stableFacts: [],
      }),
    }

    await expect(readMemoryPromptText({
      gateway,
      scope: createPromptContext().scope,
    })).resolves.toEqual({
      promptContext: createPromptContext({
        profileSummary: null,
        recentTurns: [],
        stableFacts: [],
      }),
      promptText: '',
    })
  })

  it('web stub remains safe through the prompt-memory reader', async () => {
    const scope = {
      characterId: 'character-a',
      sessionId: 'session-a',
      userId: 'user-a',
    }
    const gateway = createMemoryGateway({ runtime: 'web' })

    await expect(readMemoryPromptText({
      gateway,
      scope,
    })).resolves.toEqual({
      promptContext: {
        memoryCards: [],
        profileSummary: null,
        recentTurns: [],
        schemaVersion: 0,
        scope,
        stableFacts: [],
      },
      promptText: '',
    })
  })
})

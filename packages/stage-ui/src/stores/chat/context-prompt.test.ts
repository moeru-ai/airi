import type { ContextSnapshot } from './context-prompt'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { describe, expect, it } from 'vitest'

import { buildContextPromptMessage, formatContextPromptText } from './context-prompt'

function makeContext(overrides: Record<string, unknown> = {}): ContextSnapshot {
  return {
    'system:minecraft-integration': [
      {
        id: 'volatile-random-id',
        contextId: 'system:minecraft-integration',
        strategy: ContextUpdateStrategy.ReplaceSelf,
        text: 'Bot is online in forest biome',
        createdAt: 1743940440000,
        metadata: {
          source: {
            id: 'system:minecraft-integration',
            kind: 'plugin' as const,
            plugin: { id: 'airi:minecraft' },
          },
        },
        ...overrides,
      },
    ],
  }
}

describe('formatContextPromptText', () => {
  it('returns empty string for empty snapshot', () => {
    expect(formatContextPromptText({})).toBe('')
  })

  // https://github.com/moeru-ai/airi/issues/1539
  it('issue #1539: excludes id, createdAt, and metadata from serialized output', () => {
    const text = formatContextPromptText(makeContext())

    expect(text).not.toContain('volatile-random-id')
    expect(text).not.toContain('1743940440000')
    expect(text).not.toContain('airi:minecraft')
  })

  it('emits a flat [Context] bullet list (no XML wrapper)', () => {
    const text = formatContextPromptText(makeContext())

    expect(text).not.toContain('<context>')
    expect(text).not.toContain('<module')
    expect(text.startsWith('[Context]')).toBe(true)
    expect(text).toContain('- system:minecraft-integration: Bot is online in forest biome')
  })

  it('produces identical output regardless of volatile fields', () => {
    const a = formatContextPromptText(makeContext({ id: 'aaa', createdAt: 1 }))
    const b = formatContextPromptText(makeContext({ id: 'bbb', createdAt: 2 }))

    expect(a).toBe(b)
  })

  it('formats multiple modules as bullets under one [Context] header', () => {
    const snapshot: ContextSnapshot = {
      'system:minecraft-integration': [
        {
          id: 'a',
          contextId: 'system:minecraft-integration',
          strategy: ContextUpdateStrategy.ReplaceSelf,
          text: 'Bot is online',
          createdAt: 0,
        },
      ],
      'system:weather': [
        {
          id: 'b',
          contextId: 'system:weather',
          strategy: ContextUpdateStrategy.ReplaceSelf,
          text: 'Sunny, 22C',
          createdAt: 0,
        },
      ],
    }

    const text = formatContextPromptText(snapshot)

    const lines = text.split('\n')
    expect(lines[0]).toBe('[Context]')
    expect(lines).toContain('- system:minecraft-integration: Bot is online')
    expect(lines).toContain('- system:weather: Sunny, 22C')
  })
})

describe('buildContextPromptMessage', () => {
  it('returns null for empty snapshot', () => {
    expect(buildContextPromptMessage({})).toBeNull()
  })

  it('returns a user message with context text', () => {
    const msg = buildContextPromptMessage(makeContext())

    expect(msg).not.toBeNull()
    expect(msg!.role).toBe('user')
    expect(msg!.content).toBeInstanceOf(Array)
  })
})

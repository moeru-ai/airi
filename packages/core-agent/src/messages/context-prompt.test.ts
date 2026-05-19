import type { ContextSnapshot } from './context-prompt'

import { ContextUpdateStrategy } from '@proj-airi/server-shared/types'
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

/**
 * @example
 * formatContextPromptText(contextRegistry.snapshot())
 */
describe('formatContextPromptText', () => {
  /**
   * @example
   * Empty context snapshots produce no prompt text.
   */
  it('returns empty string for empty snapshot', () => {
    expect(formatContextPromptText({})).toBe('')
  })

  /**
   * @example
   * Issue #1539: volatile context fields stay out of the rendered prompt.
   */
  it('issue #1539: excludes id, createdAt, and metadata from serialized output', () => {
    const text = formatContextPromptText(makeContext())

    expect(text).not.toContain('volatile-random-id')
    expect(text).not.toContain('1743940440000')
    expect(text).not.toContain('airi:minecraft')
  })

  /**
   * @example
   * Context prompt text uses a flat bullet list instead of XML wrappers.
   */
  it('emits a flat [Context] bullet list without XML wrappers', () => {
    const text = formatContextPromptText(makeContext())

    expect(text).not.toContain('<context>')
    expect(text).not.toContain('<module')
    expect(text.startsWith('[Context]')).toBe(true)
    expect(text).toContain('- system:minecraft-integration: Bot is online in forest biome')
  })

  /**
   * @example
   * Multiple buckets render as one context block with multiple bullets.
   */
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

    const lines = formatContextPromptText(snapshot).split('\n')

    expect(lines[0]).toBe('[Context]')
    expect(lines).toContain('- system:minecraft-integration: Bot is online')
    expect(lines).toContain('- system:weather: Sunny, 22C')
  })
})

/**
 * @example
 * buildContextPromptMessage(contextRegistry.snapshot())
 */
describe('buildContextPromptMessage', () => {
  /**
   * @example
   * Empty context snapshots return null instead of an empty user message.
   */
  it('returns null for empty snapshot', () => {
    expect(buildContextPromptMessage({})).toBeNull()
  })

  /**
   * @example
   * Non-empty context snapshots become user-role context prompt messages.
   */
  it('returns a user message with context text', () => {
    const msg = buildContextPromptMessage(makeContext())

    expect(msg).not.toBeNull()
    expect(msg?.role).toBe('user')
    expect(msg?.content).toBeInstanceOf(Array)
  })
})

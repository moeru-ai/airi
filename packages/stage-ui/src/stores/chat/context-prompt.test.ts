import type { ContextSnapshot } from './context-prompt'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { describe, expect, it } from 'vitest'

import { buildContextPromptMessage, formatContextPromptText } from './context-prompt'

function makeContext(overrides: Record<string, unknown> = {}): ContextSnapshot {
  return {
    'system:datetime': [
      {
        id: 'volatile-random-id',
        contextId: 'system:datetime',
        strategy: ContextUpdateStrategy.ReplaceSelf,
        text: 'Current datetime: 2026-04-07T12:34:00.000Z',
        createdAt: 1743940440000,
        metadata: {
          source: {
            id: 'system:datetime',
            kind: 'plugin' as const,
            plugin: { id: 'airi:system:datetime' },
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
    expect(text).not.toContain('metadata')
    expect(text).not.toContain('airi:system:datetime')
  })

  // https://github.com/moeru-ai/airi/issues/1539
  it('issue #1539: includes only contextId, strategy, and text', () => {
    const text = formatContextPromptText(makeContext())

    expect(text).toContain('system:datetime')
    expect(text).toContain('replace-self')
    expect(text).toContain('Current datetime: 2026-04-07T12:34:00.000Z')
  })

  // https://github.com/moeru-ai/airi/issues/1539
  it('issue #1539: produces identical output regardless of volatile fields', () => {
    const a = formatContextPromptText(makeContext({ id: 'aaa', createdAt: 1 }))
    const b = formatContextPromptText(makeContext({ id: 'bbb', createdAt: 2 }))

    expect(a).toBe(b)
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

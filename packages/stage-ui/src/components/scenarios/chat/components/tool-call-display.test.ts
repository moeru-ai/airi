import { describe, expect, it } from 'vitest'

import { createToolResultError, normalizeToolResultText } from './tool-call-display'

describe('tool call display helpers', () => {
  /**
   * @example
   * expect(normalizeToolResultText({ ok: true })).toContain('"ok": true')
   */
  it('normalizes structured tool results into copyable text', () => {
    const text = normalizeToolResultText({
      ok: true,
      mode: 'focus',
    })

    expect(text).toContain('"ok": true')
    expect(text).toContain('"mode": "focus"')
  })

  /**
   * @example
   * expect(createToolResultError('Tool failed')?.message).toBe('Tool failed')
   */
  it('creates an Error wrapper for failed tool results', () => {
    const error = createToolResultError('Tool call error for "play_chess": Focus mode does not accept game-state mutation inputs.')

    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toContain('Focus mode does not accept game-state mutation inputs.')
  })
})

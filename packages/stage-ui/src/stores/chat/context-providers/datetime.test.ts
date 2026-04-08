import { describe, expect, it, vi } from 'vitest'

import { createDatetimeContext } from './datetime'

describe('createDatetimeContext', () => {
  it('returns a context message with datetime text', () => {
    const ctx = createDatetimeContext()

    expect(ctx.contextId).toBe('system:datetime')
    expect(ctx.text).toContain('Current datetime:')
    expect(ctx.strategy).toBe('replace-self')
  })

  it('includes ISO string in text', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-04-07T12:34:56.789Z'))
      const ctx = createDatetimeContext()

      expect(ctx.text).toContain('2026-04-07T12:34:56.789Z')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('produces different text at different times', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-04-07T12:34:00.000Z'))
      const a = createDatetimeContext()

      vi.setSystemTime(new Date('2026-04-07T12:35:00.000Z'))
      const b = createDatetimeContext()

      expect(a.text).not.toBe(b.text)
    }
    finally {
      vi.useRealTimers()
    }
  })
})

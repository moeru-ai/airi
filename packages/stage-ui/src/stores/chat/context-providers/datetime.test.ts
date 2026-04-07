import { describe, expect, it, vi } from 'vitest'

import { createDatetimeContext } from './datetime'

describe('createDatetimeContext', () => {
  // https://github.com/moeru-ai/airi/issues/1539
  it('issue #1539: uses a fixed deterministic id instead of a random one', () => {
    const a = createDatetimeContext()
    const b = createDatetimeContext()
    expect(a.id).toBe(b.id)
    expect(a.id).toBe('system:datetime:singleton')
  })

  // https://github.com/moeru-ai/airi/issues/1539
  it('issue #1539: quantizes time to the minute (seconds and ms are zeroed)', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-04-07T12:34:56.789Z'))
      const ctx = createDatetimeContext()

      expect(ctx.text).toContain('2026-04-07T12:34:00.000Z')
      expect(ctx.createdAt).toBe(new Date('2026-04-07T12:34:00.000Z').getTime())
    }
    finally {
      vi.useRealTimers()
    }
  })

  // https://github.com/moeru-ai/airi/issues/1539
  it('issue #1539: produces identical output for calls within the same minute', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-04-07T12:34:10.000Z'))
      const a = createDatetimeContext()

      vi.setSystemTime(new Date('2026-04-07T12:34:45.999Z'))
      const b = createDatetimeContext()

      expect(a.id).toBe(b.id)
      expect(a.text).toBe(b.text)
      expect(a.createdAt).toBe(b.createdAt)
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('produces different text when the minute changes', () => {
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

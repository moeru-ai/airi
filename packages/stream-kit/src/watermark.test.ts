import { describe, expect, it } from 'vitest'

import { Watermark } from './watermark'

describe('watermark', () => {
  it('marks an event as late only when it is behind the newest time by more than the allowed lateness', () => {
    const watermark = new Watermark({ allowedLatenessMs: 100 })

    expect(watermark.newest).toBe(Number.NEGATIVE_INFINITY)
    expect(watermark.observe(1000)).toEqual({ late: false })
    expect(watermark.observe(900)).toEqual({ late: false })
    expect(watermark.observe(899)).toEqual({ late: true })
    expect(watermark.newest).toBe(1000)
    expect(watermark.observe(1200)).toEqual({ late: false })
    expect(watermark.newest).toBe(1200)
  })
})

import { describe, expect, it } from 'vitest'

import { formatClockDuration } from './clock-duration'

describe('formatClockDuration', () => {
  it('formats minutes and zero-padded seconds', () => {
    expect(formatClockDuration(75.9)).toBe('1:15')
    expect(formatClockDuration(5)).toBe('0:05')
    expect(formatClockDuration(3600)).toBe('60:00')
  })

  it('reads negative and non-finite input as zero', () => {
    expect(formatClockDuration(-3)).toBe('0:00')
    expect(formatClockDuration(Number.NaN)).toBe('0:00')
    expect(formatClockDuration(Number.POSITIVE_INFINITY)).toBe('0:00')
  })
})

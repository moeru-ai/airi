import { describe, expect, it } from 'vitest'

import { followWindowMs, formatOffset, formatTick, tickIntervalMs } from './time-format'

describe('time format', () => {
  it('grows the follow window in steps', () => {
    expect(followWindowMs(0, 5000)).toBe(10_000)
    expect(followWindowMs(0, 20_000)).toBe(30_000)
    expect(followWindowMs(0, 50_000)).toBe(60_000)
  })

  it('formats offsets', () => {
    expect(formatOffset(1234)).toBe('1.234s')
    expect(formatOffset(65_432)).toBe('1:05.432')
  })

  it('formats a tick with only the precision of its interval', () => {
    expect(formatTick(1250, 250)).toBe('1.3s')
    expect(formatTick(65_000, 5000)).toBe('1:05')
    expect(formatTick(3_900_000, 300_000)).toBe('1:05:00')
    expect(formatTick(-10_000, 10_000)).toBe('-10s')
  })

  // ROOT CAUSE:
  //
  // The tick interval stopped at 10 minutes and always kept millisecond labels, so a two-hour window drew labels such
  // as `110:00.000` that overlapped each other.
  //
  // The interval now grows to hours, and each candidate is checked against the width of its own label.
  it('picks tick intervals whose labels do not overlap', () => {
    for (const windowMs of [500, 30_000, 600_000, 7_200_000, 86_400_000]) {
      const interval = tickIntervalMs(windowMs, 1200)
      const spacingPx = interval * 1200 / windowMs
      expect(spacingPx).toBeGreaterThanOrEqual(formatTick(windowMs, interval).length * 6.5)
    }
  })
})

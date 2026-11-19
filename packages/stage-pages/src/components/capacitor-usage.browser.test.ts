import { describe, expect, it } from 'vitest'

import { capacitorCurve } from './capacitor-usage'

const day = { startedAt: '2026-03-27T00:00:00.000Z', endsAt: '2026-03-28T00:00:00.000Z' }

describe('capacitorCurve', () => {
  it('draws each debit as a smooth drop and ends at the current percent', () => {
    const curve = capacitorCurve({
      ...day,
      records: [
        { at: '2026-03-27T06:00:00.000Z', percent: 80 },
        { at: '2026-03-27T09:00:00.000Z', percent: 70 },
      ],
    }, 62, new Date('2026-03-27T12:00:00.000Z'))

    expect(curve?.line).toBe('M0 24 H220 C235 24 235 39.2 250 39.2 H345 C360 39.2 360 46.8 375 46.8 H470 C485 46.8 485 52.9 500 52.9')
    expect(curve?.area).toBe('M0 24 H220 C235 24 235 39.2 250 39.2 H345 C360 39.2 360 46.8 375 46.8 H470 C485 46.8 485 52.9 500 52.9 V100 H0 Z')
    expect(curve?.now).toEqual({ x: 500, y: 52.9 })
  })

  it('forecasts the percent that is left at the end of the window', () => {
    const curve = capacitorCurve({ ...day, records: [] }, 62, new Date('2026-03-27T12:00:00.000Z'))

    // Half of the window used 38 percent, so the other half uses 38 percent more.
    expect(curve?.forecast).toEqual({ kind: 'left', percent: 24 })
    expect(curve?.projection).toBe('M500 52.9 L1000 81.8')
  })

  it('forecasts the time at which the Capacitor runs out', () => {
    const curve = capacitorCurve({ ...day, records: [] }, 40, new Date('2026-03-27T06:00:00.000Z'))

    // 60 percent in 6 hours is 10 percent each hour, so 40 percent lasts 4 hours more.
    expect(curve?.forecast).toEqual({ kind: 'empty', at: new Date('2026-03-27T10:00:00.000Z') })
    expect(curve?.projection).toBe('M250 69.6 L416.7 100')
  })

  it.each([
    { name: 'a full Capacitor', percent: 100, now: '2026-03-27T12:00:00.000Z' },
    { name: 'an empty Capacitor', percent: 0, now: '2026-03-27T12:00:00.000Z' },
    { name: 'the first minutes of a window', percent: 90, now: '2026-03-27T00:30:00.000Z' },
  ])('gives no forecast for $name', ({ percent, now }) => {
    const curve = capacitorCurve({ ...day, records: [] }, percent, new Date(now))

    expect(curve?.forecast).toBeNull()
    expect(curve?.projection).toBeNull()
  })

  it('ignores records outside the window and after now', () => {
    const curve = capacitorCurve({
      ...day,
      records: [
        { at: '2026-03-26T23:00:00.000Z', percent: 10 },
        { at: '2026-03-27T06:00:00.000Z', percent: 80 },
        { at: '2026-03-27T18:00:00.000Z', percent: 5 },
      ],
    }, 80, new Date('2026-03-27T12:00:00.000Z'))

    expect(curve?.line).toBe('M0 24 H220 C235 24 235 39.2 250 39.2 H500')
  })

  it('drops straight down when a debit has no hold before it', () => {
    const curve = capacitorCurve({
      ...day,
      records: [{ at: '2026-03-27T00:00:00.000Z', percent: 80 }],
    }, 80, new Date('2026-03-27T12:00:00.000Z'))

    expect(curve?.line).toBe('M0 24 V39.2 H500')
  })

  it.each([
    { name: 'no window', usage: { startedAt: null, endsAt: null, records: [] }, now: '2026-03-27T12:00:00.000Z' },
    { name: 'a window that starts later', usage: { ...day, records: [] }, now: '2026-03-26T12:00:00.000Z' },
  ])('returns null for $name', ({ usage, now }) => {
    expect(capacitorCurve(usage, 50, new Date(now))).toBeNull()
  })
})

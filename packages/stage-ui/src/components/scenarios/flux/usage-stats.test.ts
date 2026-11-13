import type { DailyUsage } from '@proj-airi/api-server/types/flux-usage'

import { describe, expect, it } from 'vitest'

import { buildActivity, computeStreaks } from './usage-stats'

function daysFrom(firstDate: string, totals: number[]): DailyUsage[] {
  return totals.map((microFlux, index) => {
    const date = new Date(`${firstDate}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + index)
    return { date: date.toISOString().slice(0, 10), microFlux }
  })
}

describe('usage stats', () => {
  it.each([
    { label: 'a gap between runs', totals: [1, 1, 1, 1, 0, 1, 1], expected: { longest: 4, current: 2 } },
    { label: 'an empty today', totals: [0, 1, 1, 1, 0], expected: { longest: 3, current: 3 } },
    { label: 'an empty yesterday', totals: [1, 1, 0, 0], expected: { longest: 2, current: 0 } },
    { label: 'no usage', totals: [0, 0, 0], expected: { longest: 0, current: 0 } },
  ])('calculates streaks with $label', ({ totals, expected }) => {
    expect(computeStreaks(daysFrom('2026-10-01', totals))).toEqual(expected)
  })

  it('aggregates partial weeks across year-end and accumulates without losing fees', () => {
    const days = daysFrom('2025-12-28', [2, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(buildActivity(days, 'weekly').groups.map(group => [group.date, group.endDate, group.microFlux])).toEqual([
      ['2025-12-28', '2025-12-28', 2],
      ['2025-12-29', '2026-01-04', 28],
      ['2026-01-05', '2026-01-05', 8],
    ])
    expect(buildActivity(days, 'cumulative').groups.map(group => group.microFlux)).toEqual([2, 30, 38])
  })
})

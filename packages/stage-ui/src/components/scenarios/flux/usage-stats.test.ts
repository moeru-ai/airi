import type { DailyUsage } from '@proj-airi/api-server/types/flux-usage'

import { describe, expect, it } from 'vitest'

import { buildActivity, computeStreaks, formatDay, formatDuration, formatFlux } from './usage-stats'

function daysFrom(firstDate: string, totals: number[]): DailyUsage[] {
  return totals.map((microFlux, index) => {
    const date = new Date(`${firstDate}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + index)
    return { date: date.toISOString().slice(0, 10), microFlux }
  })
}

describe('usage stats', () => {
  describe('computeStreaks', () => {
    it('finds the longest run and the run that ends on the last day', () => {
      expect(computeStreaks(daysFrom('2026-10-01', [1, 1, 1, 1, 0, 1, 1]))).toEqual({ longest: 4, current: 2 })
    })

    it('keeps the current streak when only today is empty', () => {
      expect(computeStreaks(daysFrom('2026-10-01', [0, 1, 1, 1, 0]))).toEqual({ longest: 3, current: 3 })
    })

    it('ends the current streak after an empty yesterday', () => {
      expect(computeStreaks(daysFrom('2026-10-01', [1, 1, 0, 0]))).toEqual({ longest: 2, current: 0 })
    })

    it('returns zero for no days and days without usage', () => {
      expect(computeStreaks([])).toEqual({ longest: 0, current: 0 })
      expect(computeStreaks(daysFrom('2026-10-01', [0, 0, 0]))).toEqual({ longest: 0, current: 0 })
    })
  })

  describe('buildActivity', () => {
    it('keeps partial weeks and groups fees from Monday through Sunday', () => {
      const days = daysFrom('2026-10-04', [2, 1, 2, 3, 4, 5, 6, 7, 8])
      const weekly = buildActivity(days, 'weekly')
      expect(weekly.groups.map(group => [group.date, group.endDate, group.microFlux])).toEqual([
        ['2026-10-04', '2026-10-04', 2],
        ['2026-10-05', '2026-10-11', 28],
        ['2026-10-12', '2026-10-12', 8],
      ])
      expect(weekly.weekCount).toBe(3)
    })

    it('accumulates weekly totals without losing edge days', () => {
      const cumulative = buildActivity(daysFrom('2026-10-04', [2, 1, 2, 3, 4, 5, 6, 7, 8]), 'cumulative')
      expect(cumulative.groups.map(group => group.microFlux)).toEqual([2, 30, 38])
      const heights = cumulative.groups.map(group => cumulative.cells.filter(cell => cell.column === group.column && cell.visible).length)
      expect(heights).toEqual([1, 6, 7])
    })

    it('keeps tile identities across modes and places daily dates in weekday rows', () => {
      const days = daysFrom('2026-10-04', [1, 2, 3])
      const daily = buildActivity(days, 'daily')
      const weekly = buildActivity(days, 'weekly')
      expect(daily.cells.map(cell => cell.id)).toEqual(weekly.cells.map(cell => cell.id))
      expect(daily.groups.map(group => [group.column, group.row])).toEqual([[0, 6], [1, 0], [1, 1]])
      expect(daily.cells.filter(cell => cell.visible)).toHaveLength(3)
    })

    it('uses quartiles so one very busy day does not hide quieter days', () => {
      const { cells } = buildActivity(daysFrom('2026-10-05', [0, 10, 11, 12, 13, 1_000_000]), 'daily')
      expect(cells[0]!.level).toBe(0)
      expect(cells[1]!.level).toBeGreaterThan(0)
      expect(cells[5]!.level).toBeGreaterThan(cells[4]!.level)
    })

    it('handles leap day and the year boundary without changing calendar dates', () => {
      expect(buildActivity(daysFrom('2024-02-28', [1, 2, 3]), 'daily').groups.map(group => group.date)).toEqual(['2024-02-28', '2024-02-29', '2024-03-01'])
      expect(buildActivity(daysFrom('2025-12-31', [1, 2]), 'weekly').groups[0]!.microFlux).toBe(3)
    })

    it('hides zero bars and returns an empty layout for no days', () => {
      expect(buildActivity(daysFrom('2026-10-05', [0, 0]), 'weekly').cells.every(cell => !cell.visible)).toBe(true)
      expect(buildActivity([], 'daily').groups).toEqual([])
    })

    it('keeps the rolling year and drops a crowded first month label', () => {
      const days = daysFrom('2025-11-30', Array.from<number>({ length: 365 }).fill(1))
      const layout = buildActivity(days, 'daily')
      expect(layout.groups).toHaveLength(365)
      expect(layout.groups[0]!.date).toBe('2025-11-30')
      expect(layout.groups.at(-1)!.date).toBe('2026-11-29')
      expect(layout.monthLabels[0]!.date).toBe('2025-12-01')
      expect(layout.monthLabels.at(-1)!.date).toBe('2026-11-01')
    })
  })

  it('formats local days, Flux, and durations', () => {
    expect(formatDay('2026-10-25', 'en')).toBe('Oct 25, 2026')
    expect(formatFlux(1_234_567, 'en')).toBe('1.23')
    expect(formatFlux(0, 'en')).toBe('0')
    expect(formatFlux(1_234_567_000, 'en')).toBe('1,235')
    expect(formatDuration(42 * 60_000, 'en')).toBe('42m')
    expect(formatDuration(3.7 * 3_600_000, 'en')).toBe('3.7h')
    expect(formatDuration(50 * 3_600_000, 'en')).toBe('2.1d')
  })
})

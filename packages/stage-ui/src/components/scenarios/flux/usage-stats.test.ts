import type { DailyUsage } from './usage-stats'

import { describe, expect, it } from 'vitest'

import { buildHeatmap, computeStreaks, daysOfCalendarYear, formatDay, formatDuration, formatFlux, lastDays, microFluxToFlux, totalMicroFlux } from './usage-stats'

function daysFrom(firstDate: string, totals: number[]): DailyUsage[] {
  return totals.map((total, index) => {
    const date = new Date(`${firstDate}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + index)
    return { date: date.toISOString().slice(0, 10), llmMicroFlux: total, ttsMicroFlux: 0, newSessionCount: 0 }
  })
}

describe('usage stats', () => {
  it('converts micro-Flux to Flux and adds both layers of a day', () => {
    expect(microFluxToFlux(2_500_000)).toBe(2.5)
    expect(totalMicroFlux({ date: '2026-10-25', llmMicroFlux: 1_000_000, ttsMicroFlux: 500_000, newSessionCount: 0 })).toBe(1_500_000)
  })

  it('keeps the newest days', () => {
    const days = daysFrom('2026-10-20', [1, 2, 3, 4, 5, 6])
    expect(lastDays(days, 2).map(day => day.date)).toEqual(['2026-10-24', '2026-10-25'])
    expect(lastDays(days, 99)).toHaveLength(6)
  })

  describe('computeStreaks', () => {
    it('finds the longest run and the run that ends on the last day', () => {
      expect(computeStreaks(daysFrom('2026-10-01', [1, 1, 1, 1, 0, 1, 1]))).toEqual({ longest: 4, current: 2 })
    })

    it('keeps the current streak when only the last day is empty', () => {
      expect(computeStreaks(daysFrom('2026-10-01', [0, 1, 1, 1, 0]))).toEqual({ longest: 3, current: 3 })
    })

    it('ends the current streak after one empty day before the last day', () => {
      expect(computeStreaks(daysFrom('2026-10-01', [1, 1, 0, 0]))).toEqual({ longest: 2, current: 0 })
    })

    it('returns zero for no days and for days without usage', () => {
      expect(computeStreaks([])).toEqual({ longest: 0, current: 0 })
      expect(computeStreaks(daysFrom('2026-10-01', [0, 0, 0]))).toEqual({ longest: 0, current: 0 })
    })
  })

  describe('daysOfCalendarYear', () => {
    it('keeps the year and adds the days that have not happened', () => {
      const days = daysFrom('2025-12-31', [8, 3])
      const year = daysOfCalendarYear(days, 2026)

      expect(year).toHaveLength(365)
      expect(year[0]).toEqual({ date: '2026-01-01', llmMicroFlux: 3, ttsMicroFlux: 0, newSessionCount: 0 })
      expect(year[1]).toEqual({ date: '2026-01-02', llmMicroFlux: 0, ttsMicroFlux: 0, newSessionCount: 0 })
      expect(year.at(-1)?.date).toBe('2026-12-31')
      expect(year.some(day => day.date.startsWith('2025'))).toBe(false)
    })

    it('includes February 29 in a leap year', () => {
      const year = daysOfCalendarYear([], 2024)

      expect(year).toHaveLength(366)
      expect(year.some(day => day.date === '2024-02-29')).toBe(true)
    })
  })

  describe('buildHeatmap', () => {
    it('returns an empty layout for no days', () => {
      expect(buildHeatmap([])).toEqual({ cells: [], weekCount: 0, monthLabels: [] })
    })

    it('starts a calendar year on January 1 and keeps later empty days', () => {
      const { cells } = buildHeatmap(daysOfCalendarYear(daysFrom('2025-12-31', [1, 2]), 2026))

      expect(cells[0]).toMatchObject({ date: '2026-01-01', weekIndex: 0, weekday: 4, level: 1 })
      expect(cells.at(-1)).toMatchObject({ date: '2026-12-31', level: 0 })
      expect(cells).toHaveLength(365)
    })

    it('puts Sunday in row 0 and starts the first column on the weekday of the oldest day', () => {
      // 2026-10-22 is a Thursday.
      const { cells, weekCount } = buildHeatmap(daysFrom('2026-10-22', [1, 1, 1, 1, 1, 1]))

      expect(cells.map(cell => [cell.date, cell.weekIndex, cell.weekday])).toEqual([
        ['2026-10-22', 0, 4],
        ['2026-10-23', 0, 5],
        ['2026-10-24', 0, 6],
        ['2026-10-25', 1, 0],
        ['2026-10-26', 1, 1],
        ['2026-10-27', 1, 2],
      ])
      expect(weekCount).toBe(2)
    })

    it('gives a day without usage level 0 and spreads busy days over levels 1 to 4', () => {
      const { cells } = buildHeatmap(daysFrom('2026-10-04', [0, 10, 20, 30, 40]))

      expect(cells.map(cell => cell.level)).toEqual([0, 1, 2, 3, 4])
    })

    it('does not let one very busy day hide the other days', () => {
      const { cells } = buildHeatmap(daysFrom('2026-10-04', [10, 11, 12, 13, 1_000_000]))

      expect(cells.map(cell => cell.level)).toEqual([1, 1, 2, 3, 4])
    })

    it('labels each new month at its first column and drops a first label that has no room', () => {
      // The oldest day is Saturday 2026-10-31. Its column and the next column start in different months.
      const crowded = buildHeatmap(daysFrom('2026-10-31', Array.from<number>({ length: 90 }).fill(1)))
      expect(crowded.monthLabels[0]).toEqual({ weekIndex: 1, month: 11 })

      const roomy = buildHeatmap(daysFrom('2026-10-04', Array.from<number>({ length: 90 }).fill(1)))
      expect(roomy.monthLabels).toEqual([
        { weekIndex: 0, month: 10 },
        { weekIndex: 4, month: 11 },
        { weekIndex: 9, month: 12 },
      ])
    })
  })

  describe('formatting', () => {
    it('keeps the calendar day whatever the time zone of the viewer', () => {
      expect(formatDay('2026-10-25', 'en')).toBe('Oct 25')
      expect(formatDay('2026-01-01', 'en')).toBe('Jan 1')
    })

    it('shows at most two decimals below 100 Flux and whole Flux from 100', () => {
      expect(formatFlux(1_234_567, 'en')).toBe('1.23')
      expect(formatFlux(0, 'en')).toBe('0')
      expect(formatFlux(1_234_567_000, 'en')).toBe('1,235')
    })

    it('picks the largest fitting unit for a duration', () => {
      expect(formatDuration(42 * 60_000, 'en')).toBe('42m')
      expect(formatDuration(3.7 * 3_600_000, 'en')).toBe('3.7h')
      expect(formatDuration(50 * 3_600_000, 'en')).toBe('2.1d')
    })
  })
})

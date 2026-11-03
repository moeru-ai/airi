import type { DailyUsage } from '@proj-airi/api-server/types/flux-usage'

export type { DailyUsage, DailyUsageSummary } from '@proj-airi/api-server/types/flux-usage'

export type ActivityView = 'daily' | 'weekly' | 'cumulative'

/** The tooltip describes one day, one week, or usage through the end of a week. */
export interface ActivityGroup {
  date: string
  endDate: string
  microFlux: number
  column: number
  row: number
}

/** Stable tile identities let CSS move the same nodes between all three views. */
export interface ActivityCell {
  id: number
  column: number
  row: number
  level: number
  visible: boolean
}

function weekdayOf(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7
}

/** Empty today preserves yesterday's streak until the current local day ends. */
export function computeStreaks(days: readonly DailyUsage[]): { longest: number, current: number } {
  let longest = 0
  let run = 0
  for (const day of days) {
    run = day.microFlux > 0 ? run + 1 : 0
    longest = Math.max(longest, run)
  }

  const endIndex = days.at(-1)?.microFlux === 0 ? days.length - 2 : days.length - 1
  let current = 0
  for (let index = endIndex; index >= 0 && days[index]!.microFlux > 0; index--)
    current++

  return { longest, current }
}

/**
 * Uses Monday-based weeks across the supplied local days, including partial edge weeks.
 * Weekly and cumulative bars use seven tiles, scaled to their own largest value.
 * Daily intensity uses quartiles so one unusually busy day does not hide quieter days.
 */
export function buildActivity(days: readonly DailyUsage[], view: ActivityView) {
  const firstDay = days[0]
  if (!firstDay)
    return { cells: [] as ActivityCell[], groups: [] as ActivityGroup[], weekCount: 0, monthLabels: [] as { column: number, date: string }[] }

  const offset = weekdayOf(firstDay.date)
  const weekCount = Math.ceil((offset + days.length) / 7)
  const weeks: ActivityGroup[] = []
  const monthLabels: { column: number, date: string }[] = []
  let previousMonth = ''

  for (const [index, day] of days.entries()) {
    const column = Math.floor((offset + index) / 7)
    const week = weeks[column]
    if (week) {
      week.endDate = day.date
      week.microFlux += day.microFlux
    }
    else {
      weeks.push({ date: day.date, endDate: day.date, microFlux: day.microFlux, column, row: 0 })
    }

    const month = day.date.slice(0, 7)
    if (month !== previousMonth) {
      monthLabels.push({ column, date: day.date })
      previousMonth = month
    }
  }
  // A partial first month needs three columns of space for its label.
  if (monthLabels.length > 1 && monthLabels[1]!.column - monthLabels[0]!.column < 3)
    monthLabels.shift()

  let cumulative = 0
  const groups = view === 'daily'
    ? days.map((day, index) => ({ ...day, endDate: day.date, column: Math.floor((offset + index) / 7), row: (offset + index) % 7 }))
    : weeks.map((week) => {
        cumulative += week.microFlux
        return { ...week, microFlux: view === 'cumulative' ? cumulative : week.microFlux }
      })

  const max = Math.max(...groups.map(group => group.microFlux))
  const usedTotals = days.map(day => day.microFlux).filter(total => total > 0).sort((left, right) => left - right)
  const thresholds = [0.25, 0.5, 0.75].map(fraction => usedTotals[Math.floor(fraction * (usedTotals.length - 1))] ?? 0)

  const cells = Array.from({ length: weekCount * 7 }, (_, id): ActivityCell => {
    const column = Math.floor(id / 7)
    const slot = id % 7
    if (view === 'daily') {
      const day = days[id - offset]
      const value = day?.microFlux ?? 0
      return { id, column, row: slot, visible: !!day, level: value > 0 ? 1 + thresholds.filter(threshold => value > threshold).length : 0 }
    }

    const value = groups[column]!.microFlux
    // Keep nonzero weeks visible even when their share is less than one tile.
    const height = max > 0 && value > 0 ? Math.max(1, Math.round(value / max * 7)) : 0
    return { id, column, row: slot < height ? 6 - slot : 6, visible: slot < height, level: 4 }
  })

  return { cells, groups, weekCount, monthLabels }
}

/** The input is already a local day. UTC formatting preserves that calendar date. */
export function formatDay(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}

export function formatFlux(microFlux: number, locale: string): string {
  const flux = microFlux / 1_000_000
  return new Intl.NumberFormat(locale, { maximumFractionDigits: flux >= 100 ? 0 : 2 }).format(flux)
}

/** Uses whole minutes, then hours or days with one decimal as the duration increases. */
export function formatDuration(milliseconds: number, locale: string): string {
  let unit: 'minute' | 'hour' | 'day' = 'minute'
  let value = milliseconds / 60_000
  if (milliseconds >= 86_400_000) {
    unit = 'day'
    value = milliseconds / 86_400_000
  }
  else if (milliseconds >= 3_600_000) {
    unit = 'hour'
    value = milliseconds / 3_600_000
  }

  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'narrow',
    maximumFractionDigits: unit === 'minute' ? 0 : 1,
  }).format(value)
}

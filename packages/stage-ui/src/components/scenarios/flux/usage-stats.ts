/** One local day of usage, as `GET /api/v1/flux/usage/daily` returns it. */
export interface DailyUsage {
  /** The `YYYY-MM-DD` calendar day in the time zone that the viewer sent to the API. */
  date: string
  llmMicroFlux: number
  ttsMicroFlux: number
  /** Sessions whose first request was on this day. LLM and speech are not separate. */
  newSessionCount: number
}

/** The full response of `GET /api/v1/flux/usage/daily`. */
export interface DailyUsageSummary {
  /** One item for each of the last 365 local days, oldest first. */
  days: DailyUsage[]
  longestSessionMs: number
}

export type HeatmapLevel = 0 | 1 | 2 | 3 | 4

/** One dot of the heat map. The grid has one column for each week and one row for each weekday. */
export interface HeatmapCell {
  date: string
  /** Column of the dot. Column 0 is the week of the oldest day. */
  weekIndex: number
  /** Row of the dot. 0 is Sunday. */
  weekday: number
  microFlux: number
  /** 0 is a day without Flux usage. 1 to 4 give the share of the busiest days. */
  level: HeatmapLevel
}

export interface HeatmapLayout {
  cells: HeatmapCell[]
  weekCount: number
  /** Columns that start a new month label. `month` is 1 for January. */
  monthLabels: { weekIndex: number, month: number }[]
}

const MICRO_FLUX_PER_FLUX = 1_000_000
const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS
/** A month label needs this many columns of room, or it overlaps the next label. */
const MIN_MONTH_LABEL_GAP = 3

export function microFluxToFlux(microFlux: number): number {
  return microFlux / MICRO_FLUX_PER_FLUX
}

export function totalMicroFlux(day: DailyUsage): number {
  return day.llmMicroFlux + day.ttsMicroFlux
}

export function lastDays(days: readonly DailyUsage[], count: number): DailyUsage[] {
  return days.slice(-count)
}

/**
 * Counts runs of consecutive days that have Flux usage.
 * An empty last day does not end the current streak, because that day is not over yet.
 */
export function computeStreaks(days: readonly DailyUsage[]): { longest: number, current: number } {
  let longest = 0
  let run = 0
  for (const day of days) {
    run = totalMicroFlux(day) > 0 ? run + 1 : 0
    longest = Math.max(longest, run)
  }

  const lastDay = days.at(-1)
  const endIndex = lastDay && totalMicroFlux(lastDay) === 0 ? days.length - 2 : days.length - 1
  let current = 0
  for (let index = endIndex; index >= 0 && totalMicroFlux(days[index]!) > 0; index--)
    current++

  return { longest, current }
}

function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

/**
 * One day for each date of `year`, from January 1 through December 31.
 * A date missing from `days` is an empty day. Days outside `year` are left out.
 */
export function daysOfCalendarYear(days: readonly DailyUsage[], year: number): DailyUsage[] {
  const byDate = new Map(days.map(day => [day.date, day]))
  const filled: DailyUsage[] = []
  const cursor = new Date(Date.UTC(year, 0, 1))
  const end = Date.UTC(year, 11, 31)
  while (cursor.getTime() <= end) {
    const date = cursor.toISOString().slice(0, 10)
    filled.push(byDate.get(date) ?? { date, llmMicroFlux: 0, ttsMicroFlux: 0, newSessionCount: 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return filled
}

function quantile(sortedValues: readonly number[], fraction: number): number {
  return sortedValues[Math.floor(fraction * (sortedValues.length - 1))]!
}

/**
 * Lays the days out as a heat map grid, with quartile levels over the days that have usage.
 * Quartiles keep one very busy day from turning every other day into the lightest level.
 */
export function buildHeatmap(days: readonly DailyUsage[]): HeatmapLayout {
  const firstDay = days[0]
  if (!firstDay)
    return { cells: [], weekCount: 0, monthLabels: [] }

  const usedTotals = days.map(totalMicroFlux).filter(total => total > 0).sort((left, right) => left - right)
  const thresholds = usedTotals.length > 0
    ? [0.25, 0.5, 0.75].map(fraction => quantile(usedTotals, fraction))
    : []
  const levelOf = (total: number): HeatmapLevel => {
    if (total <= 0)
      return 0
    return (1 + thresholds.filter(threshold => total > threshold).length) as HeatmapLevel
  }

  // The first column starts on the weekday of the oldest day, so earlier rows of that column stay empty.
  const firstWeekday = weekdayOf(firstDay.date)
  const cells = days.map((day, index): HeatmapCell => {
    const total = totalMicroFlux(day)
    return {
      date: day.date,
      weekIndex: Math.floor((firstWeekday + index) / 7),
      weekday: (firstWeekday + index) % 7,
      microFlux: total,
      level: levelOf(total),
    }
  })

  const monthLabels: HeatmapLayout['monthLabels'] = []
  let previousMonth = 0
  for (const cell of cells) {
    // A column starts on Sunday. Only the oldest column can start later.
    const startsColumn = cell.weekday === 0 || cell === cells[0]
    if (!startsColumn)
      continue
    const month = Number(cell.date.slice(5, 7))
    if (month !== previousMonth)
      monthLabels.push({ weekIndex: cell.weekIndex, month })
    previousMonth = month
  }
  // The first label sits in a partial column and can touch the next label. Drop it in that case.
  if (monthLabels.length > 1 && monthLabels[1]!.weekIndex - monthLabels[0]!.weekIndex < MIN_MONTH_LABEL_GAP)
    monthLabels.shift()

  return { cells, weekCount: cells.at(-1)!.weekIndex + 1, monthLabels }
}

/** Formats a `YYYY-MM-DD` day for the reader. The day is already local, so the formatter must not shift it. */
export function formatDay(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}

export function formatFlux(microFlux: number, locale: string): string {
  const flux = microFluxToFlux(microFlux)
  return new Intl.NumberFormat(locale, { maximumFractionDigits: flux >= 100 ? 0 : 2 }).format(flux)
}

/** Formats a duration as whole minutes, or as hours or days with one decimal. For example, `42m`, `3.7h`, or `2.1d`. */
export function formatDuration(milliseconds: number, locale: string): string {
  let unit: 'minute' | 'hour' | 'day' = 'minute'
  let value = milliseconds / MINUTE_MS
  if (milliseconds >= DAY_MS) {
    unit = 'day'
    value = milliseconds / DAY_MS
  }
  else if (milliseconds >= HOUR_MS) {
    unit = 'hour'
    value = milliseconds / HOUR_MS
  }

  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'narrow',
    maximumFractionDigits: unit === 'minute' ? 0 : 1,
  }).format(value)
}

import type { Weekday } from '@proj-airi/core-agent'

/** The days of a week from Monday, as `Date#getDay` counts them. */
export const WEEK: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0]

/** The short local name of a weekday. October 4, 2026 is a Sunday. */
export function weekdayLabel(day: Weekday, locale: string) {
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2026, 9, 4 + day))
}

/** The local names of some weekdays as one list, from Monday. */
export function weekdaysLabel(days: readonly Weekday[], locale: string) {
  return new Intl.ListFormat(locale, { style: 'short' }).format(WEEK.filter(day => days.includes(day)).map(day => weekdayLabel(day, locale)))
}

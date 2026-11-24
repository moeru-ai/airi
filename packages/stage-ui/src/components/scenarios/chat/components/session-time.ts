import { differenceInCalendarDays, intlFormat, intlFormatDistance, isSameYear } from 'date-fns'

/**
 * The time of the last message for a conversation row, short like a messenger list: the clock time today, then the
 * day, the weekday for the last week, and the date before that.
 *
 * @example
 * formatSessionRowTime(new Date('2026-11-24T09:05'), new Date('2026-11-24T18:00'), 'en')
 * // => '09:05 AM'
 * formatSessionRowTime(new Date('2026-11-23T09:05'), new Date('2026-11-24T18:00'), 'en')
 * // => 'yesterday'
 */
export function formatSessionRowTime(at: Date | number, now: Date | number, locale: string): string {
  const daysAgo = differenceInCalendarDays(now, at)
  if (daysAgo <= 0)
    return intlFormat(at, { hour: '2-digit', minute: '2-digit' }, { locale })
  if (daysAgo === 1)
    return intlFormatDistance(at, now, { locale, unit: 'day', numeric: 'auto' })
  if (daysAgo < 7)
    return intlFormat(at, { weekday: 'short' }, { locale })
  if (isSameYear(at, now))
    return intlFormat(at, { month: 'short', day: 'numeric' }, { locale })
  return intlFormat(at, { year: 'numeric', month: 'numeric', day: 'numeric' }, { locale })
}

/**
 * The full date and time of the last message, for the tooltip of the row time and the menu of a touch row.
 *
 * @example
 * formatSessionFullTime(new Date('2026-11-24T09:05'), 'en')
 * // => 'Nov 24, 2026, 9:05 AM'
 */
export function formatSessionFullTime(at: Date | number, locale: string): string {
  return intlFormat(at, { dateStyle: 'medium', timeStyle: 'short' }, { locale })
}

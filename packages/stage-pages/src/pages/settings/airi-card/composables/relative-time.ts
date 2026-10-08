const DIVISIONS: { amount: number, unit: Intl.RelativeTimeFormatUnit }[] = [
  { amount: 60, unit: 'second' },
  { amount: 60, unit: 'minute' },
  { amount: 24, unit: 'hour' },
  { amount: 7, unit: 'day' },
  { amount: 4.34524, unit: 'week' },
  { amount: 12, unit: 'month' },
  { amount: Number.POSITIVE_INFINITY, unit: 'year' },
]

/**
 * Formats a past or future time in words, such as "2 hours ago", in the
 * given locale. Returns an empty string for an unparseable value.
 */
export function formatRelativeTime(value: string | number | Date, locale: string): string {
  const time = new Date(value).getTime()
  if (Number.isNaN(time))
    return ''

  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  let duration = (time - Date.now()) / 1000
  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount)
      return formatter.format(Math.round(duration), division.unit)
    duration /= division.amount
  }
  return ''
}

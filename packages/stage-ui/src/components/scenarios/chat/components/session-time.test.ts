import { describe, expect, it } from 'vitest'

import { formatSessionFullTime, formatSessionRowTime } from './session-time'

// A Tuesday evening, local time, so the calendar-day rules do not depend on the time zone of the runner.
const now = new Date(2026, 10, 24, 18, 0)

describe('formatSessionRowTime', () => {
  it('shows the clock time for a message of today', () => {
    expect(formatSessionRowTime(new Date(2026, 10, 24, 9, 5), now, 'en')).toBe('09:05 AM')
    expect(formatSessionRowTime(new Date(2026, 10, 24, 9, 5), now, 'zh-Hans')).toBe('09:05')
  })

  it('names yesterday instead of giving a time', () => {
    expect(formatSessionRowTime(new Date(2026, 10, 23, 23, 59), now, 'en')).toBe('yesterday')
    expect(formatSessionRowTime(new Date(2026, 10, 23, 23, 59), now, 'zh-Hans')).toBe('昨天')
  })

  it('shows the weekday for the rest of the last week', () => {
    expect(formatSessionRowTime(new Date(2026, 10, 22, 12, 0), now, 'en')).toBe('Sun')
    expect(formatSessionRowTime(new Date(2026, 10, 18, 12, 0), now, 'en')).toBe('Wed')
  })

  it('shows the date from seven days ago, with the year only for an earlier year', () => {
    expect(formatSessionRowTime(new Date(2026, 10, 17, 12, 0), now, 'en')).toBe('Nov 17')
    expect(formatSessionRowTime(new Date(2025, 11, 31, 12, 0), now, 'en')).toBe('12/31/2025')
  })

  // A message from another device can carry a clock that runs ahead. It still reads as today.
  it('shows the clock time for a time after now', () => {
    expect(formatSessionRowTime(new Date(2026, 10, 24, 18, 30), now, 'en')).toBe('06:30 PM')
  })
})

describe('formatSessionFullTime', () => {
  it('gives the date and the time', () => {
    expect(formatSessionFullTime(new Date(2026, 10, 24, 9, 5), 'en')).toBe('Nov 24, 2026, 9:05 AM')
  })
})

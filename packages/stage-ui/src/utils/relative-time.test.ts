import { describe, expect, it } from 'vitest'

import { formatRelativeTime } from './relative-time'

describe('formatRelativeTime', () => {
  it('formats recent timestamps in seconds', () => {
    expect(formatRelativeTime(10_000, 12_000)).toBe('2 seconds ago')
    expect(formatRelativeTime(10_000, 11_000)).toBe('1 second ago')
  })

  it('marks timestamps older than a minute as stale', () => {
    expect(formatRelativeTime(10_000, 70_000)).toBe('Stale')
  })
})

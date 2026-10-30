import { describe, expect, it } from 'vitest'

import { aggregate, percentile } from '.'

const hundred = Array.from({ length: 100 }, (_, index) => 100 - index)

describe('percentile', () => {
  it('gives the nearest-rank value', () => {
    expect(percentile([5, 1, 4, 2, 3], 50)).toBe(3)
    expect(percentile([5, 1, 4, 2, 3], 75)).toBe(4)
    expect(percentile(hundred, 95)).toBe(95)
    expect(percentile(hundred, 99)).toBe(99)
  })

  it('gives no value for an empty list', () => {
    expect(percentile([], 50)).toBeUndefined()
  })

  it('gives no p95 or p99 for fewer than 100 samples', () => {
    expect(percentile(hundred.slice(1), 95)).toBeUndefined()
    expect(percentile(hundred.slice(1), 99)).toBeUndefined()
  })

  it('gives the minimum and the maximum for a percentile outside 0 to 100', () => {
    expect(percentile([5, 1, 4], -10)).toBe(1)
    expect(percentile([5, 1, 4], 0)).toBe(1)
    expect(percentile(hundred, 150)).toBe(100)
  })
})

describe('aggregate', () => {
  it('gives the mean, the sum, and the count', () => {
    expect(aggregate([1, 2, 3, 6], ['mean', 'sum', 'count'])).toEqual({ mean: 3, sum: 12, count: 4 })
  })

  it('gives no mean and a sum of 0 for an empty list', () => {
    expect(aggregate([], ['mean', 'sum', 'count', 'p50'])).toEqual({ mean: undefined, sum: 0, count: 0, p50: undefined })
  })
})

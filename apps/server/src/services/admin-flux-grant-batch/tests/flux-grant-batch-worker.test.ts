import { describe, expect, it } from 'vitest'

import { backoffMs } from '../flux-grant-batch-worker'

describe('backoffMs', () => {
  it('returns 0 for unattempted recipients', () => {
    expect(backoffMs(0)).toBe(0)
    expect(backoffMs(-1)).toBe(0)
  })

  it('returns 30s after the first attempt', () => {
    expect(backoffMs(1)).toBe(30_000)
  })

  it('returns 5min after the second and subsequent attempts', () => {
    expect(backoffMs(2)).toBe(300_000)
    expect(backoffMs(5)).toBe(300_000)
  })
})

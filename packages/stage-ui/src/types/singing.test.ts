import { describe, expect, it } from 'vitest'

import { getSingingElapsedSeconds } from './singing'

describe('getSingingElapsedSeconds', () => {
  it('uses the current time while a job is still running', () => {
    expect(getSingingElapsedSeconds(1_000, 4_000, 'running', 9_000)).toBe(8)
  })

  it('freezes elapsed time at the terminal updatedAt timestamp', () => {
    expect(getSingingElapsedSeconds(1_000, 5_000, 'completed', 99_000)).toBe(4)
    expect(getSingingElapsedSeconds(1_000, 5_000, 'failed', 99_000)).toBe(4)
    expect(getSingingElapsedSeconds(1_000, 5_000, 'cancelled', 99_000)).toBe(4)
  })

  it('never returns a negative duration', () => {
    expect(getSingingElapsedSeconds(5_000, 1_000, 'completed', 99_000)).toBe(0)
  })
})

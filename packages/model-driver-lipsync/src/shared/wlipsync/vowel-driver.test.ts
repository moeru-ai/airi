import { describe, expect, it } from 'vitest'

import { createWLipSyncVowelDriver } from './index'

describe('wLipSync vowel driver', () => {
  it('maps S to I and returns only the two strongest vowels', () => {
    const driver = createWLipSyncVowelDriver(() => 1000)

    const weights = driver.update({
      volume: 1,
      weights: {
        A: 1,
        E: 0.8,
        I: 0.1,
        O: 0.6,
        S: 0.9,
        U: 0.4,
      },
    }, 1)

    expect(weights.A).toBeCloseTo(0.49)
    expect(weights.I).toBeCloseTo(0.245)
    expect(weights.E).toBe(0)
    expect(weights.O).toBe(0)
    expect(weights.U).toBe(0)
  })

  it('uses the release rate when the audio becomes silent', () => {
    let now = 1000
    const driver = createWLipSyncVowelDriver(() => now)
    const activeWeights = driver.update({ volume: 1, weights: { A: 1 } }, 0.016)

    now += 16
    const silentWeights = driver.update({ volume: 0, weights: {} }, 0.016)

    expect(silentWeights.A).toBeGreaterThan(0)
    expect(silentWeights.A).toBeLessThan(activeWeights.A)
  })

  it('resets all smoothing state', () => {
    const driver = createWLipSyncVowelDriver(() => 1000)
    driver.update({ volume: 1, weights: { A: 1 } }, 1)

    driver.reset()
    const weights = driver.update({ volume: 0, weights: {} }, 1)

    expect(weights).toEqual({ A: 0, E: 0, I: 0, O: 0, U: 0 })
  })
})

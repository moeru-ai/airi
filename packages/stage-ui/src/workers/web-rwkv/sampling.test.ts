import { describe, expect, it } from 'vitest'

import { applyTopK } from './sampling'

describe('applyTopK', () => {
  it('keeps the k highest entries and renormalizes to sum 1', () => {
    // @example applyTopK([0.5, 0.3, 0.15, 0.05], 2) -> [0.625, 0.375, 0, 0]
    // (Float32Array storage rounds, so assert with closeTo.)
    const probs = Float32Array.of(0.5, 0.3, 0.15, 0.05)
    applyTopK(probs, 2)
    expect(probs[0]).toBeCloseTo(0.625, 6)
    expect(probs[1]).toBeCloseTo(0.375, 6)
    expect(probs[2]).toBe(0)
    expect(probs[3]).toBe(0)
  })

  it('truncates regardless of input order', () => {
    const probs = Float32Array.of(0.05, 0.5, 0.15, 0.3)
    applyTopK(probs, 2)
    expect(probs[0]).toBe(0) // 0.05 dropped
    expect(probs[2]).toBe(0) // 0.15 dropped
    expect(probs[1]).toBeCloseTo(0.625, 6)
    expect(probs[3]).toBeCloseTo(0.375, 6)
  })

  it('is a no-op when k is 0 (disabled)', () => {
    const probs = Float32Array.of(0.5, 0.3, 0.2)
    applyTopK(probs, 0)
    expect(probs[0]).toBeCloseTo(0.5, 6)
    expect(probs[1]).toBeCloseTo(0.3, 6)
    expect(probs[2]).toBeCloseTo(0.2, 6)
  })

  it('is a no-op when k is at least the vocabulary size', () => {
    const probs = Float32Array.of(0.6, 0.4)
    applyTopK(probs, 2)
    expect(probs[0]).toBeCloseTo(0.6, 6)
    expect(probs[1]).toBeCloseTo(0.4, 6)
  })

  it('keeps all tied entries at the cutoff (may exceed k)', () => {
    // Three-way tie below the top entry: with k=2 the cutoff equals the tie value,
    // so all three tied entries survive rather than arbitrarily dropping one.
    const probs = Float32Array.of(0.4, 0.2, 0.2, 0.2)
    applyTopK(probs, 2)
    expect(probs[0]).toBeGreaterThan(0)
    expect(probs[1]).toBeGreaterThan(0)
    expect(probs[2]).toBeGreaterThan(0)
    expect(probs[3]).toBeGreaterThan(0)
    const sum = probs.reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1, 6)
  })
})

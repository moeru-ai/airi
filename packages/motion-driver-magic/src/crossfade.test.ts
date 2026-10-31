import type { Generator } from './types'

import { describe, expect, it } from 'vitest'

import { crossfade } from './crossfade'

function constant(value: number, sampleRateHz = 30): Generator<number> & { calls: () => number } {
  let calls = 0
  return {
    sampleRateHz,
    calls: () => calls,
    next: () => {
      calls += 1
      return { values: [value, -value], state: value }
    },
  }
}

describe('crossfade', () => {
  it('blends from the first generator to the second generator', () => {
    const from = constant(0)
    const to = constant(1)
    const generator = crossfade(from, to, { frameCount: 4 })

    const values = Array.from({ length: 6 }, () => generator.next().values[0])
    expect(values[0]).toBeGreaterThan(0)
    expect(values[0]).toBeLessThan(0.5)
    for (let index = 1; index < values.length; index += 1)
      expect(values[index]).toBeGreaterThanOrEqual(values[index - 1])
    expect(values[3]).toBe(1)
    expect(values[5]).toBe(1)
  })

  it('stops the outgoing generator after the blend', () => {
    const from = constant(0)
    const to = constant(1)
    const generator = crossfade(from, to, { frameCount: 2 })
    for (let index = 0; index < 5; index += 1)
      generator.next()

    expect(from.calls()).toBe(2)
    expect(to.calls()).toBe(5)
  })

  it('reports the state of the incoming generator', () => {
    const generator = crossfade(constant(0), constant(3), { frameCount: 2 })
    expect(generator.next().state).toBe(3)
  })

  it('switches at once without frames', () => {
    const generator = crossfade(constant(0), constant(1), { frameCount: 0 })
    expect(generator.next().values).toEqual([1, -1])
  })

  it('rejects generators with different sample rates', () => {
    expect(() => crossfade(constant(0, 30), constant(1, 60), { frameCount: 2 })).toThrow('different sample rates')
  })
})

import type { RawSegment } from './events'
import type { ProbeSettings } from './probe'

import { describe, expect, it } from 'vitest'

import { probeClip } from './probe'

const settings: ProbeSettings = {
  sampleRate: 16000,
  count: 8,
  ranges: { snrDb: [10, 20], shiftMs: [0, 0], speed: [1, 1] },
  seed: 1,
  blankPenalty: 2,
  firstCount: 3,
}

/** One segment with a token every 0.2 s, from `startTime` seconds. */
function segment(text: string, startTime = 0): RawSegment[] {
  return [{ text, tokens: [...text], timestamps: [...text].map((_, index) => 0.2 * index), ysProbs: [], startTime }]
}

/** A pool that answers each decode from `heard` and counts the decodes. */
function scriptedPool(heard: (call: number, blankPenalty: number) => string) {
  let calls = 0
  return {
    get calls() {
      return calls
    },
    decode: async (_samples: Float32Array, options: { blankPenalty: number }) => segment(heard(calls++, options.blankPenalty)),
  }
}

describe('probeClip', () => {
  it('skips the remaining decodes when the first ones match the reference', async () => {
    const pool = scriptedPool(() => '我想要')

    const result = await probeClip(pool, new Float32Array(16000), settings)

    // The reference, three perturbed decodes, and the blank penalty decode.
    expect(pool.calls).toBe(5)
    expect(result.stoppedEarly).toBe(true)
    expect(result.samples).toHaveLength(3)
    expect(result.probe?.tokens.map(token => token.text).join('')).toBe('我想要')
  })

  it('runs every decode when one of the first ones differs', async () => {
    // Call 0 is the reference. Call 2 is the second perturbed decode.
    const pool = scriptedPool(call => call === 2 ? '我想药' : '我想要')
    const progress: [number, number][] = []

    const result = await probeClip(pool, new Float32Array(16000), settings, { onProgress: (done, total) => progress.push([done, total]) })

    expect(result.stoppedEarly).toBe(false)
    expect(result.samples).toHaveLength(8)
    expect(pool.calls).toBe(10)
    expect(progress.at(-1)).toEqual([10, 10])
  })

  it('runs every decode when one of the first ones hears the same words at another time', async () => {
    let calls = 0
    // Call 1, the first perturbed decode, hears the words 1 s later than the reference.
    const pool = { decode: async () => segment('我想要', calls++ === 1 ? 1 : 0) }

    const result = await probeClip(pool, new Float32Array(3 * 16000), { ...settings, blankPenalty: 0 })

    expect(result.stoppedEarly).toBe(false)
    expect(result.samples).toHaveLength(8)
  })

  it('ignores punctuation when it compares the first decodes', async () => {
    const pool = scriptedPool(call => call === 1 ? '我想要。' : '我想要')

    const result = await probeClip(pool, new Float32Array(16000), { ...settings, blankPenalty: 0 })

    expect(result.stoppedEarly).toBe(true)
  })

  it('runs every decode without the early stop', async () => {
    const pool = scriptedPool(() => '我想要')

    const result = await probeClip(pool, new Float32Array(16000), { ...settings, firstCount: 0, blankPenalty: 0 })

    expect(result.stoppedEarly).toBe(false)
    expect(pool.calls).toBe(9)
  })
})

import { describe, expect, it } from 'vitest'

import { InputLevel, NoiseStream } from './live-noise'

function rms(samples: Float32Array) {
  return Math.sqrt(samples.reduce((total, sample) => total + sample * sample, 0) / samples.length)
}

describe('inputLevel', () => {
  it('rises to a louder block at once and halves after each half-life of quieter input', () => {
    const level = new InputLevel(10, 1)

    expect(level.update(new Float32Array(10).fill(0.4))).toBeCloseTo(0.4)
    expect(level.update(new Float32Array(10))).toBeCloseTo(0.2)
    expect(level.update(new Float32Array(20))).toBeCloseTo(0.05)
    expect(level.update(new Float32Array(10).fill(0.3))).toBeCloseTo(0.3)
  })
})

describe('noiseStream', () => {
  it('adds noise at the requested level below the input level', () => {
    const block = new Float32Array(16000)
    const noisy = new NoiseStream(20, 7).apply(block, 0.5)

    // 20 dB below an RMS of 0.5 is an RMS of 0.05.
    expect(rms(noisy)).toBeCloseTo(0.05, 2)
    expect(block.every(sample => sample === 0)).toBe(true)
  })

  it('repeats the same noise for the same seed and blocks', () => {
    const block = new Float32Array(1600).fill(0.1)
    const first = new NoiseStream(10, 3)
    const second = new NoiseStream(10, 3)

    expect(second.apply(block, 0.2)).toEqual(first.apply(block, 0.2))
    expect(second.apply(block, 0.2)).toEqual(first.apply(block, 0.2))
  })

  it('continues the noise across blocks instead of repeating it', () => {
    const block = new Float32Array(1600)
    const stream = new NoiseStream(10, 3)

    expect(stream.apply(block, 0.2)).not.toEqual(stream.apply(block, 0.2))
  })
})

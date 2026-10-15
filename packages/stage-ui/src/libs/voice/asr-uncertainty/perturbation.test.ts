import { describe, expect, it } from 'vitest'

import { cleanPerturbation, perturbAudio, samplePerturbations, toSourceSeconds } from './perturbation'

function sine(seconds: number, sampleRate: number) {
  return Float32Array.from({ length: Math.round(seconds * sampleRate) }, (_, index) => 0.5 * Math.sin(2 * Math.PI * 220 * index / sampleRate))
}

function rms(samples: Float32Array) {
  return Math.sqrt(samples.reduce((total, sample) => total + sample * sample, 0) / samples.length)
}

describe('perturbAudio', () => {
  it('returns the clip unchanged for the clean perturbation', () => {
    const clip = sine(0.1, 16000)

    expect(perturbAudio(clip, 16000, cleanPerturbation)).toEqual(clip)
  })

  it('inserts the shift as leading samples and shortens the clip by the speed', () => {
    const clip = sine(1, 16000)
    const output = perturbAudio(clip, 16000, { snrDb: Number.POSITIVE_INFINITY, shiftMs: 50, speed: 1.25, seed: 1 })

    expect(output.length).toBe(800 + 12800)
    expect(output.subarray(0, 800).every(sample => sample === 0)).toBe(true)
  })

  it('adds noise at the requested level relative to the speech', () => {
    const clip = sine(1, 16000)
    const output = perturbAudio(clip, 16000, { snrDb: 20, shiftMs: 0, speed: 1, seed: 7 })
    const noise = output.map((sample, index) => sample - clip[index])

    // 20 dB below a sine of amplitude 0.5 (RMS 0.354) is an RMS of 0.0354.
    expect(rms(noise)).toBeCloseTo(0.0354, 2)
  })

  it('repeats the same noise for the same seed', () => {
    const clip = sine(0.1, 16000)
    const perturbation = { snrDb: 10, shiftMs: 0, speed: 1, seed: 3 }

    expect(perturbAudio(clip, 16000, perturbation)).toEqual(perturbAudio(clip, 16000, perturbation))
  })
})

describe('samplePerturbations', () => {
  it('draws values inside the ranges and repeats them for the same seed', () => {
    const ranges = { snrDb: [10, 30], shiftMs: [0, 40], speed: [0.95, 1.05] } as const
    const first = samplePerturbations(16, ranges, 42)

    expect(first).toEqual(samplePerturbations(16, ranges, 42))
    expect(first.every(item => item.snrDb >= 10 && item.snrDb <= 30)).toBe(true)
    expect(first.every(item => item.shiftMs >= 0 && item.shiftMs <= 40)).toBe(true)
    expect(first.every(item => item.speed >= 0.95 && item.speed <= 1.05)).toBe(true)
  })
})

describe('toSourceSeconds', () => {
  it('undoes the shift and the speed', () => {
    expect(toSourceSeconds(1.03, { snrDb: 20, shiftMs: 30, speed: 1.1, seed: 1 })).toBeCloseTo(1.1)
  })

  it('maps times inside the inserted silence to the clip start', () => {
    expect(toSourceSeconds(0.01, { snrDb: 20, shiftMs: 30, speed: 1, seed: 1 })).toBe(0)
  })
})

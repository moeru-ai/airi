import { describe, expect, it } from 'vitest'

import { toMonoSamples } from './mono-samples'

function audioWindow(...channels: number[][]) {
  return { channels: channels.map(values => Float32Array.from(values)) }
}

describe('toMonoSamples', () => {
  it('averages the channels', () => {
    expect(toMonoSamples(audioWindow([0.5, -0.5], [0.25, 0.25]))).toEqual(new Float32Array([0.375, -0.125]))
  })

  it('clamps samples to [-1, 1] and replaces non-finite samples with 0', () => {
    const samples = toMonoSamples(audioWindow([1.5, -1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0.25]))

    expect(samples).toEqual(new Float32Array([1, -1, 0, 0, 0, 0.25]))
  })

  it('returns a copy, so the window keeps its samples', () => {
    const input = audioWindow([1.5])

    toMonoSamples(input)[0] = 0

    expect(input.channels[0]).toEqual(new Float32Array([1.5]))
  })
})

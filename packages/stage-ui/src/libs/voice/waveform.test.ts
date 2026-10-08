import { describe, expect, it } from 'vitest'

import { waveformPeaks, waveformSlots } from './waveform'

describe('waveformPeaks', () => {
  it('keeps the peak of each bucket, scaled to the loudest one', () => {
    expect(waveformPeaks(new Float32Array([0, 0.5, 0, -0.25]), 2)).toEqual([1, 0.5])
  })

  it('keeps silence at zero', () => {
    expect(waveformPeaks(new Float32Array(8), 4)).toEqual([0, 0, 0, 0])
  })

  it('gives every bucket a sample when there are fewer samples than buckets', () => {
    expect(waveformPeaks(new Float32Array([0.5, 1]), 4)).toEqual([0.5, 0.5, 1, 1])
  })
})

describe('waveformSlots', () => {
  it('fits 3px bars with 2px gaps', () => {
    expect(waveformSlots(3)).toBe(1)
    expect(waveformSlots(23)).toBe(5)
    expect(waveformSlots(0)).toBe(0)
  })
})

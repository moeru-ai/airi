import { describe, expect, it } from 'vitest'

import { MESSAGE_WAVEFORM_BARS, RECORDING_WAVEFORM_BARS, waveformPeaks, waveformSlots } from './waveform'

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
  it('fits bars with their gaps', () => {
    expect(waveformSlots(3, RECORDING_WAVEFORM_BARS)).toBe(1)
    expect(waveformSlots(23, RECORDING_WAVEFORM_BARS)).toBe(5)
    expect(waveformSlots(18, MESSAGE_WAVEFORM_BARS)).toBe(5)
    expect(waveformSlots(0, MESSAGE_WAVEFORM_BARS)).toBe(0)
  })
})

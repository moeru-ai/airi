import { describe, expect, it } from 'vitest'

import {
  createVoiceInputWavFromPcmSegment,
  shouldSkipVoiceInputSegment,
} from './voice-input-audio-segment'

describe('createVoiceInputWavFromPcmSegment', () => {
  it('wraps vad pcm samples as a transcription-ready wav blob with diagnostics', async () => {
    const result = createVoiceInputWavFromPcmSegment({
      buffer: new Float32Array([0, 0.5, -0.5, 1, -1]),
      durationMs: 5,
      sampleRate: 1000,
    })

    expect(result.blob.type).toBe('audio/wav')
    expect(result.blob.size).toBe(54)
    expect(result.diagnostics.durationMs).toBe(5)
    expect(result.diagnostics.sampleRate).toBe(1000)
    expect(result.diagnostics.sampleCount).toBe(5)
    expect(result.diagnostics.peak).toBe(1)
    expect(result.diagnostics.rms).toBeCloseTo(0.7071, 4)

    const bytes = new Uint8Array(await result.blob.arrayBuffer())
    const riff = String.fromCharCode(...bytes.slice(0, 4))
    const wave = String.fromCharCode(...bytes.slice(8, 12))

    expect(riff).toBe('RIFF')
    expect(wave).toBe('WAVE')
  })
})

describe('shouldSkipVoiceInputSegment', () => {
  it('keeps speech-like segments above the duration and loudness gates', () => {
    const result = shouldSkipVoiceInputSegment({
      durationMs: 900,
      peak: 0.3,
      rms: 0.04,
      sampleCount: 14400,
      sampleRate: 16000,
    })

    expect(result.skip).toBe(false)
  })

  it('skips segments that are too short or too quiet for reliable transcription', () => {
    expect(shouldSkipVoiceInputSegment({
      durationMs: 250,
      peak: 0.4,
      rms: 0.08,
      sampleCount: 4000,
      sampleRate: 16000,
    })).toEqual({
      skip: true,
      reason: 'too_short',
    })

    expect(shouldSkipVoiceInputSegment({
      durationMs: 900,
      peak: 0.01,
      rms: 0.002,
      sampleCount: 14400,
      sampleRate: 16000,
    })).toEqual({
      skip: true,
      reason: 'too_quiet',
    })
  })
})

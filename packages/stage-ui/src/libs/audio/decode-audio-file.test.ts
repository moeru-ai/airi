import { describe, expect, it } from 'vitest'

import { resampleMonoLinear } from './decode-audio-file'

describe('resampleMonoLinear', () => {
  // https://github.com/moeru-ai/airi/issues/1342
  it('issue #1342 keeps identical samples when rates match so local STT can reuse decoded PCM', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1])
    expect(resampleMonoLinear(samples, 16_000, 16_000)).toBe(samples)
  })

  // https://github.com/moeru-ai/airi/issues/1342
  it('issue #1342 downsamples mono PCM for Whisper 16 kHz input', () => {
    // ROOT CAUSE:
    //
    // Browser-local transcription settings were a WIP stub, and even a naive
    // OpenAI-compatible local page still required a base URL. Real in-browser
    // Whisper needs decoded mono PCM at 16 kHz from arbitrary uploaded files.
    //
    // We fixed this by decoding the FormData file client-side and resampling
    // before calling the Whisper adapter.
    const samples = new Float32Array(4)
    samples[0] = 0
    samples[1] = 1
    samples[2] = 0
    samples[3] = -1

    const resampled = resampleMonoLinear(samples, 32_000, 16_000)
    expect(resampled).toHaveLength(2)
    expect(resampled[0]).toBeCloseTo(0, 5)
    expect(resampled[1]).toBeCloseTo(0, 5)
  })
})

import { toWav } from '@proj-airi/audio/encoding'
import { describe, expect, it } from 'vitest'

import { mediaStreamFromAudioFile } from '.'

function createSineWaveFile() {
  const sampleRate = 44_100
  const durationSeconds = 0.05
  const sampleCount = Math.floor(sampleRate * durationSeconds)
  const samples = new Float32Array(sampleCount)

  for (let index = 0; index < sampleCount; index += 1) {
    const phase = (index / sampleRate) * 440 * Math.PI * 2
    samples[index] = Math.sin(phase)
  }

  return new File([toWav(samples.buffer, sampleRate)], 'tone.wav', { type: 'audio/wav' })
}

describe('mediaStreamFromAudioFile', () => {
  it('decodes a browser audio file into a media stream and releases resources', async () => {
    const result = await mediaStreamFromAudioFile(createSineWaveFile())

    expect(result.stream).toBeInstanceOf(MediaStream)
    expect(result.stream.getAudioTracks()).toHaveLength(1)

    await result.cleanup()

    expect(result.stream.getAudioTracks()[0]?.readyState).toBe('ended')
  })
})

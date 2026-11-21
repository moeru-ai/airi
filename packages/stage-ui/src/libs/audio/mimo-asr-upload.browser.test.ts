import { toWavFromPCM16 } from '@proj-airi/audio/encoding'
import { afterEach, describe, expect, it, vi } from 'vitest'

import stereoRecordingUrl from './fixtures/mimo-stereo.webm?url'

import { prepareMimoAsrUpload } from './mimo-asr-upload'

afterEach(() => vi.restoreAllMocks())

describe('miMo browser audio uploads', () => {
  // https://github.com/moeru-ai/airi/pull/2410
  // ROOT CAUSE: Portable providers cannot decode recorder containers through a browser AudioContext.
  it('preserves supported WAV and MP3 bytes even when their MIME labels differ', async () => {
    const wav = new File([toWavFromPCM16(new Uint8Array([0, 0, 1, 0]), 16_000)], 'recording.wav', { type: 'audio/webm' })
    const mp3 = new File([new Uint8Array([0xFF, 0xFB, 0x90, 0x64])], 'recording.mp3', { type: 'application/octet-stream' })

    expect(await prepareMimoAsrUpload(wav)).toBe(wav)
    expect(await prepareMimoAsrUpload(mp3)).toBe(mp3)
  })

  it('decodes a real stereo WebM recording and encodes its channel average as mono WAV', async () => {
    const response = await fetch(stereoRecordingUrl)
    expect(response.ok).toBe(true)
    const bytes = await response.arrayBuffer()
    // The fixture contains synthetic stereo sine waves. A wrong MIME label must not bypass byte inspection.
    const file = new File([bytes], 'recording.webm', { type: 'audio/wav' })
    const context = new AudioContext()
    try {
      const source = await context.decodeAudioData(bytes.slice(0))
      expect(source.numberOfChannels).toBe(2)
      const converted = await prepareMimoAsrUpload(file)
      expect(converted).not.toBe(file)
      expect(converted.type).toBe('audio/wav')
      const wavBytes = await converted.arrayBuffer()
      const header = new DataView(wavBytes)
      expect(String.fromCharCode(...new Uint8Array(wavBytes, 0, 4))).toBe('RIFF')
      expect(String.fromCharCode(...new Uint8Array(wavBytes, 8, 4))).toBe('WAVE')
      expect(header.getUint16(22, true)).toBe(1)
      expect(header.getUint32(24, true)).toBe(source.sampleRate)
      const decoded = await context.decodeAudioData(wavBytes)
      expect(decoded.numberOfChannels).toBe(1)
      expect(decoded.length).toBe(source.length)
      const left = source.getChannelData(0)
      const right = source.getChannelData(1)
      const mono = decoded.getChannelData(0)
      let maximumError = 0
      for (let index = 0; index < source.length; index++)
        maximumError = Math.max(maximumError, Math.abs(mono[index] - (left[index] + right[index]) / 2))
      expect(maximumError).toBeLessThan(0.0001)
    }
    finally {
      await context.close()
    }
  })

  it('reports an invalid container and closes the browser decoder', async () => {
    const close = vi.spyOn(AudioContext.prototype, 'close')
    await expect(prepareMimoAsrUpload(new File(['invalid audio'], 'recording.webm'))).rejects.toThrow('Unable to convert recorder audio')
    expect(close).toHaveBeenCalledOnce()
  })
})

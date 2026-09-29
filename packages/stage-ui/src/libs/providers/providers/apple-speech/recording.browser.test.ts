import { toWav } from '@proj-airi/audio/encoding'
import { describe, expect, it } from 'vitest'

import { createAppleSpeechRecordingStream } from '.'

describe('recording input for Apple Speech', () => {
  it('decodes a stereo WAV into mono 16 kHz PCM16 chunks', async () => {
    const input = new Float32Array(800 * 2)
    for (let index = 0; index < input.length; index += 2) {
      input[index] = 0.5
      input[index + 1] = -0.5
    }

    const recording = new Blob([toWav(input.buffer, 8000, 2)], { type: 'audio/wav' })
    const stream = await createAppleSpeechRecordingStream(recording)
    const pcm16 = new Uint8Array(await new Response(stream).arrayBuffer())

    expect(pcm16.byteLength).toBe(1600 * 2)
    expect(new DataView(pcm16.buffer).getInt16(0, true)).toBeCloseTo(0, 0)
  })
})

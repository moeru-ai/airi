import { describe, expect, it } from 'vitest'

import { VAD } from './vad'

describe('vAD processSpeechSegment', () => {
  it('does not zero-pad the tail when buffer is nearly full', () => {
    // ROOT CAUSE:
    //
    // When bufferPointer + speechPadSamples > this.buffer.length,
    // Float32Array.slice() silently returns a shorter array and the
    // remaining positions in finalBuffer stay as zero — corrupting the
    // emitted audio segment with silent padding.
    //
    // Before patch:
    //   finalBuffer.set(this.buffer.slice(0, this.bufferPointer + speechPadSamples), offset)
    //
    // We fixed this by clamping the slice end:
    //   finalBuffer.set(this.buffer.slice(0, Math.min(this.bufferPointer + speechPadSamples, this.buffer.length)), offset)

    // Use a tiny buffer so we can control the near-full scenario precisely.
    // sampleRate=100, maxBufferDuration=1 → buffer.length = 100 samples
    // speechPadMs=80 → speechPadSamples = 80 * (100/1000) = 8 samples
    const sampleRate = 100
    const maxBufferDuration = 1
    const speechPadMs = 80

    const vad = new VAD({ sampleRate, maxBufferDuration, speechPadMs })

    // Fill the internal buffer with a known non-zero pattern so we can
    // detect whether the emitted segment was correctly sourced from it.
    const internalBuffer: Float32Array = (vad as any).buffer
    for (let i = 0; i < internalBuffer.length; i++) {
      internalBuffer[i] = i + 1 // 1, 2, 3, … 100 (all non-zero)
    }

    // Place bufferPointer near the end: 95 samples written.
    // speechPadSamples = 8, so bufferPointer + speechPadSamples = 103 > 100.
    // Without the clamp, slice(0, 103) on a 100-element array returns only
    // 100 elements, but finalBuffer was allocated for 103 — leaving 3 zeros.
    ;(vad as any).bufferPointer = 95

    // Capture the emitted speech-ready buffer.
    let emittedBuffer: Float32Array | undefined
    vad.on('speech-ready', ({ buffer }) => {
      emittedBuffer = buffer
    })

    // Call the private method directly (no model needed).
    ;(vad as any).processSpeechSegment()

    expect(emittedBuffer).toBeDefined()

    // The emitted buffer must not end with trailing zeros introduced by the
    // over-read.  The last sample should be internalBuffer[99] = 100.
    const buf = emittedBuffer!
    expect(buf[buf.length - 1]).toBe(100)

    // Also verify the emitted buffer length equals prevLength + min(bufferPointer + speechPadSamples, buffer.length).
    // prevBuffers is empty, so prevLength = 0.
    // Expected length = min(95 + 8, 100) = 100.
    expect(buf.length).toBe(100)
  })

  it('emits the correct segment length when buffer has ample remaining space', () => {
    // Regression prevention (3.3): normal case must still work correctly.
    const sampleRate = 100
    const maxBufferDuration = 1
    const speechPadMs = 80 // 8 samples

    const vad = new VAD({ sampleRate, maxBufferDuration, speechPadMs })

    const internalBuffer: Float32Array = (vad as any).buffer
    for (let i = 0; i < internalBuffer.length; i++) {
      internalBuffer[i] = i + 1
    }

    // bufferPointer = 50; speechPadSamples = 8; 50 + 8 = 58 ≤ 100 — no clamp needed.
    ;(vad as any).bufferPointer = 50

    let emittedBuffer: Float32Array | undefined
    vad.on('speech-ready', ({ buffer }) => {
      emittedBuffer = buffer
    })

    ;(vad as any).processSpeechSegment()

    expect(emittedBuffer).toBeDefined()
    // Expected length = 50 + 8 = 58
    expect(emittedBuffer!.length).toBe(58)
    // Last sample should be internalBuffer[57] = 58
    expect(emittedBuffer![emittedBuffer!.length - 1]).toBe(58)
  })
})

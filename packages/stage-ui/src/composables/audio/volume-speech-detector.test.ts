import { describe, expect, it, vi } from 'vitest'

import { createVolumeSpeechDetector } from './volume-speech-detector'

describe('createVolumeSpeechDetector', () => {
  // https://github.com/moeru-ai/airi/issues/1832
  it('issue #1832 emits speech start/end from volume so monitoring can trigger STT without VAD', () => {
    // ROOT CAUSE:
    //
    // Hearing-module monitoring only called transcribeForMediaStream / startRecord
    // from Silero VAD onSpeechStart. When the ONNX model failed to load (or the
    // user chose volume-based detection), isSpeechVolume only drove the UI LED
    // and never started transcription — while the manual STT test path still worked.
    //
    // We fixed this by edge-triggering the same speech start/end handlers from a
    // volume detector whenever VAD is unavailable or disabled.
    const onSpeechStart = vi.fn()
    const onSpeechEnd = vi.fn()
    const detector = createVolumeSpeechDetector({ onSpeechStart, onSpeechEnd })

    expect(detector.sample({
      level: 2,
      startThreshold: 10,
      startFrames: 2,
      stopDelayMs: 100,
      now: 0,
    })).toBe(false)
    expect(onSpeechStart).not.toHaveBeenCalled()

    expect(detector.sample({
      level: 20,
      startThreshold: 10,
      startFrames: 2,
      stopDelayMs: 100,
      now: 16,
    })).toBe(false)

    expect(detector.sample({
      level: 22,
      startThreshold: 10,
      startFrames: 2,
      stopDelayMs: 100,
      now: 32,
    })).toBe(true)
    expect(onSpeechStart).toHaveBeenCalledOnce()

    expect(detector.sample({
      level: 1,
      startThreshold: 10,
      stopThreshold: 6,
      stopDelayMs: 100,
      now: 48,
    })).toBe(true)
    expect(onSpeechEnd).not.toHaveBeenCalled()

    expect(detector.sample({
      level: 1,
      startThreshold: 10,
      stopThreshold: 6,
      stopDelayMs: 100,
      now: 160,
    })).toBe(false)
    expect(onSpeechEnd).toHaveBeenCalledOnce()
  })

  it('ignores brief loud spikes below the required start frame count', () => {
    const onSpeechStart = vi.fn()
    const detector = createVolumeSpeechDetector({ onSpeechStart })

    detector.sample({
      level: 40,
      startThreshold: 10,
      startFrames: 3,
      now: 0,
    })
    detector.sample({
      level: 1,
      startThreshold: 10,
      startFrames: 3,
      now: 16,
    })
    detector.sample({
      level: 40,
      startThreshold: 10,
      startFrames: 3,
      now: 32,
    })

    expect(onSpeechStart).not.toHaveBeenCalled()
    expect(detector.isSpeaking).toBe(false)
  })

  it('reset clears in-flight speech so a new rising edge can fire', () => {
    const onSpeechStart = vi.fn()
    const detector = createVolumeSpeechDetector({ onSpeechStart })

    detector.sample({ level: 30, startThreshold: 10, startFrames: 1, now: 0 })
    expect(detector.isSpeaking).toBe(true)
    expect(onSpeechStart).toHaveBeenCalledOnce()

    detector.reset()
    expect(detector.isSpeaking).toBe(false)

    detector.sample({ level: 30, startThreshold: 10, startFrames: 1, now: 20 })
    expect(onSpeechStart).toHaveBeenCalledTimes(2)
  })
})

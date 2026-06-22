import { describe, expect, it, vi } from 'vitest'

import { cutVoiceInputPrerollRecording, hasLiveAudioInputTrack, startVoiceInputPrerollRecording } from './voice-input-recording'

function createAudioStreamLike(trackStates: Array<MediaStreamTrackState>) {
  return {
    getAudioTracks: () => trackStates.map(readyState => ({ readyState })),
  }
}

describe('hasLiveAudioInputTrack', () => {
  it('returns true when the stream has a live audio track', () => {
    const result = hasLiveAudioInputTrack(createAudioStreamLike(['ended', 'live']))

    expect(result).toBe(true)
  })

  it('returns false when the stream has only ended audio tracks', () => {
    const result = hasLiveAudioInputTrack(createAudioStreamLike(['ended']))

    expect(result).toBe(false)
  })

  it('returns false when no stream is available', () => {
    const result = hasLiveAudioInputTrack(undefined)

    expect(result).toBe(false)
  })
})

describe('startVoiceInputPrerollRecording', () => {
  it('starts recording before speech when record-then-transcribe is active', async () => {
    const startRecord = vi.fn()

    const result = await startVoiceInputPrerollRecording({
      hasStream: true,
      shouldUseStreamInput: false,
      startRecord,
    })

    expect(result).toBe(true)
    expect(startRecord).toHaveBeenCalledTimes(1)
  })

  it('does not start preroll recording for streaming transcription', async () => {
    const startRecord = vi.fn()

    const result = await startVoiceInputPrerollRecording({
      hasStream: true,
      shouldUseStreamInput: true,
      startRecord,
    })

    expect(result).toBe(false)
    expect(startRecord).not.toHaveBeenCalled()
  })
})

describe('cutVoiceInputPrerollRecording', () => {
  it('starts the next recording before waiting for the previous stop to finish', async () => {
    const calls: string[] = []
    let resolveStop!: () => void
    const stopRecord = vi.fn(() => {
      calls.push('stop')
      return new Promise<void>((resolve) => {
        resolveStop = resolve
      })
    })
    const startRecord = vi.fn(() => {
      calls.push('start')
    })

    const cut = cutVoiceInputPrerollRecording({
      hasActiveRecording: true,
      hasStream: true,
      shouldUseStreamInput: false,
      startRecord,
      stopRecord,
    })
    await Promise.resolve()

    expect(calls).toEqual(['stop', 'start'])

    resolveStop()
    await cut

    expect(stopRecord).toHaveBeenCalledTimes(1)
    expect(startRecord).toHaveBeenCalledTimes(1)
  })

  it('does not start a new recording when there is no active segment to cut', async () => {
    const stopRecord = vi.fn()
    const startRecord = vi.fn()

    const result = await cutVoiceInputPrerollRecording({
      hasActiveRecording: false,
      hasStream: true,
      shouldUseStreamInput: false,
      startRecord,
      stopRecord,
    })

    expect(result).toBe(false)
    expect(stopRecord).not.toHaveBeenCalled()
    expect(startRecord).not.toHaveBeenCalled()
  })
})

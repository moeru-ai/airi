import type { VoiceInputDebugConsole } from './voice-input-debug'

import { describe, expect, it, vi } from 'vitest'

import { createVoiceInputDebugRecorder, installVoiceInputDebugConsole } from './voice-input-debug'

describe('createVoiceInputDebugRecorder', () => {
  it('stores recent transcription attempts with playable object URLs and result states', () => {
    const createObjectURL = vi.fn((blob: Blob) => `blob:clip-${blob.size}`)
    const revokeObjectURL = vi.fn()
    const recorder = createVoiceInputDebugRecorder({
      enabled: true,
      maxEntries: 2,
      createObjectURL,
      revokeObjectURL,
    })

    const first = recorder.recordAttempt({
      blob: new Blob(['one'], { type: 'audio/wav' }),
      diagnostics: {
        durationMs: 900,
        peak: 0.3,
        rms: 0.04,
        sampleCount: 14400,
        sampleRate: 16000,
      },
    })
    const second = recorder.recordAttempt({
      blob: new Blob(['two'], { type: 'audio/wav' }),
      diagnostics: {
        durationMs: 1000,
        peak: 0.2,
        rms: 0.03,
        sampleCount: 16000,
        sampleRate: 16000,
      },
    })

    recorder.markResult(first?.id, { status: 'transcribed', text: '你好' })
    recorder.markResult(second?.id, { status: 'empty', error: 'No transcription result returned from provider' })

    expect(createObjectURL).toHaveBeenCalledTimes(2)
    expect(recorder.entries()).toMatchObject([
      {
        id: first?.id,
        status: 'transcribed',
        text: '你好',
        audioUrl: 'blob:clip-3',
      },
      {
        id: second?.id,
        status: 'empty',
        error: 'No transcription result returned from provider',
        audioUrl: 'blob:clip-3',
      },
    ])
  })

  it('keeps a bounded ring buffer and revokes object URLs when clips expire or dispose runs', () => {
    const createObjectURL = vi.fn()
      .mockReturnValueOnce('blob:first')
      .mockReturnValueOnce('blob:second')
      .mockReturnValueOnce('blob:third')
    const revokeObjectURL = vi.fn()
    const recorder = createVoiceInputDebugRecorder({
      enabled: true,
      maxEntries: 2,
      createObjectURL,
      revokeObjectURL,
    })

    recorder.recordAttempt({
      blob: new Blob(['one'], { type: 'audio/wav' }),
      diagnostics: {
        durationMs: 900,
        peak: 0.3,
        rms: 0.04,
        sampleCount: 14400,
        sampleRate: 16000,
      },
    })
    recorder.recordAttempt({
      blob: new Blob(['two'], { type: 'audio/wav' }),
      diagnostics: {
        durationMs: 1000,
        peak: 0.2,
        rms: 0.03,
        sampleCount: 16000,
        sampleRate: 16000,
      },
    })
    recorder.recordAttempt({
      blob: new Blob(['three'], { type: 'audio/wav' }),
      diagnostics: {
        durationMs: 1100,
        peak: 0.25,
        rms: 0.035,
        sampleCount: 17600,
        sampleRate: 16000,
      },
    })

    expect(recorder.entries().map(entry => entry.audioUrl)).toEqual(['blob:second', 'blob:third'])
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:first')

    recorder.dispose()

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:second')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:third')
    expect(recorder.entries()).toEqual([])
  })

  it('does not retain clips when debugging is disabled', () => {
    const createObjectURL = vi.fn()
    const recorder = createVoiceInputDebugRecorder({
      enabled: false,
      createObjectURL,
    })

    const entry = recorder.recordAttempt({
      blob: new Blob(['one'], { type: 'audio/wav' }),
      diagnostics: {
        durationMs: 900,
        peak: 0.3,
        rms: 0.04,
        sampleCount: 14400,
        sampleRate: 16000,
      },
    })

    expect(entry).toBeUndefined()
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(recorder.entries()).toEqual([])
  })
})

describe('installVoiceInputDebugConsole', () => {
  it('exposes debug entries on the provided console target and cleans up the same binding', () => {
    const recorder = createVoiceInputDebugRecorder({
      enabled: true,
      createObjectURL: () => 'blob:clip',
      revokeObjectURL: () => {},
    })
    recorder.recordAttempt({
      blob: new Blob(['one'], { type: 'audio/wav' }),
      diagnostics: {
        durationMs: 900,
        peak: 0.3,
        rms: 0.04,
        sampleCount: 14400,
        sampleRate: 16000,
      },
    })
    const target: { __airiVoiceInputDebug?: VoiceInputDebugConsole } = {}

    const uninstall = installVoiceInputDebugConsole(target, recorder)

    expect(target.__airiVoiceInputDebug).toMatchObject({
      entries: expect.any(Function),
      dispose: expect.any(Function),
    })
    expect((target.__airiVoiceInputDebug as { entries: () => unknown[] }).entries()).toHaveLength(1)

    uninstall()

    expect(target.__airiVoiceInputDebug).toBeUndefined()
  })
})

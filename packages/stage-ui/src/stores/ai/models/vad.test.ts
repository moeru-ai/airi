import { IOAttributes, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resolveVADConfig } from './vad'

const vadMocks = vi.hoisted(() => {
  const handlers = new Map<string, (event?: unknown) => void>()

  return {
    handlers,
    createVAD: vi.fn(async () => ({
      on: vi.fn((name: string, handler: (event?: unknown) => void) => handlers.set(name, handler)),
      updateConfig: vi.fn(),
    })),
    initialize: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
    stop: vi.fn(),
    dispose: vi.fn(),
  }
})

const spanMock = vi.hoisted(() => ({
  end: vi.fn(),
  setAttribute: vi.fn(),
}))

const startSpanMock = vi.hoisted(() => vi.fn(() => spanMock))

vi.mock('../../../workers/vad', () => ({
  createVAD: vadMocks.createVAD,
  createVADStates: () => ({
    initialize: vadMocks.initialize,
    start: vadMocks.start,
    stop: vadMocks.stop,
    dispose: vadMocks.dispose,
  }),
}))

vi.mock('../../../composables/use-io-tracer', () => ({
  startSpan: startSpanMock,
}))

describe('resolveVADConfig', () => {
  it('uses safer defaults for threshold and silence duration', () => {
    expect(resolveVADConfig()).toEqual({
      speechThreshold: 0.52,
      exitThreshold: 0.156,
      minSilenceDurationMs: 1200,
      speechPadMs: 360,
      minSpeechDurationMs: 300,
    })
  })

  it('preserves explicit threshold and silence duration values', () => {
    expect(resolveVADConfig(0.45, 650, 420, 500)).toEqual({
      speechThreshold: 0.45,
      exitThreshold: 0.135,
      minSilenceDurationMs: 650,
      speechPadMs: 420,
      minSpeechDurationMs: 500,
    })
  })
})

describe('useVAD', () => {
  beforeEach(() => {
    vadMocks.handlers.clear()
    vi.clearAllMocks()
  })

  it('records a completed VAD span for each detected speech segment', async () => {
    const { useVAD } = await import('./vad')
    const vad = useVAD('vad-worker-url')

    await vad.init()
    vadMocks.handlers.get('speech-start')?.()
    vadMocks.handlers.get('speech-ready')?.({
      buffer: new Float32Array([0.25, -0.25]),
      duration: 1500,
    })

    expect(startSpanMock).toHaveBeenCalledWith(
      IOSpanNames.VoiceActivityDetection,
      undefined,
      {
        [IOAttributes.Subsystem]: IOSubsystems.VAD,
      },
    )
    expect(spanMock.setAttribute).toHaveBeenCalledWith(IOAttributes.VADAudioDurationMs, 1500)
    expect(spanMock.end).toHaveBeenCalledOnce()
  })

  it('marks an active VAD span as aborted when the session is disposed', async () => {
    const { useVAD } = await import('./vad')
    const vad = useVAD('vad-worker-url')

    await vad.init()
    vadMocks.handlers.get('speech-start')?.()
    vad.dispose()

    expect(spanMock.setAttribute).toHaveBeenCalledWith(IOAttributes.VADAborted, true)
    expect(spanMock.end).toHaveBeenCalledOnce()
  })

  it('forwards VAD-owned PCM chunks while speech is active', async () => {
    const onSpeechAudio = vi.fn()
    const { useVAD } = await import('./vad')
    const vad = useVAD('vad-worker-url', { onSpeechAudio })
    const buffer = new Float32Array([0.25, -0.25])

    await vad.init()
    vadMocks.handlers.get('speech-audio')?.({ buffer })

    expect(onSpeechAudio).toHaveBeenCalledWith({ buffer })
  })

  // https://github.com/moeru-ai/airi/pull/2258#discussion_r3759400512
  it('runs speech-end cleanup when canceled speech has no cancel handler', async () => {
    // ROOT CAUSE:
    //
    // End-only consumers did not receive the new speech-cancel event. Their
    // recorder or streaming session therefore remained active after VAD
    // rejected a segment that was shorter than minSpeechDurationMs.
    //
    // We use the end handler as the terminal fallback when a consumer does not
    // provide a dedicated cancel handler.
    const onSpeechEnd = vi.fn()
    const { useVAD } = await import('./vad')
    const vad = useVAD('vad-worker-url', { onSpeechEnd })

    await vad.init()
    vadMocks.handlers.get('speech-start')?.()
    vadMocks.handlers.get('speech-cancel')?.()

    expect(onSpeechEnd).toHaveBeenCalledOnce()
  })

  it('uses the dedicated cancel handler instead of speech-end cleanup', async () => {
    const onSpeechCancel = vi.fn()
    const onSpeechEnd = vi.fn()
    const { useVAD } = await import('./vad')
    const vad = useVAD('vad-worker-url', { onSpeechCancel, onSpeechEnd })

    await vad.init()
    vadMocks.handlers.get('speech-start')?.()
    vadMocks.handlers.get('speech-cancel')?.()

    expect(onSpeechCancel).toHaveBeenCalledOnce()
    expect(onSpeechEnd).not.toHaveBeenCalled()
  })
})

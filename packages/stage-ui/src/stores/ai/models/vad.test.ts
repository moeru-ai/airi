import type { TraceRecord } from '@proj-airi/trace-kit'

import { VoiceAttributes, VoiceNames } from '@proj-airi/trace-kit/voice'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { configureTraceTransport } from '../../../composables/use-trace'
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

vi.mock('../../../workers/vad', () => ({
  createVAD: vadMocks.createVAD,
  createVADStates: () => ({
    initialize: vadMocks.initialize,
    start: vadMocks.start,
    stop: vadMocks.stop,
    dispose: vadMocks.dispose,
  }),
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
  const records: TraceRecord[] = []
  let stopTransport: (() => void) | undefined

  beforeEach(() => {
    vadMocks.handlers.clear()
    vi.clearAllMocks()
    stopTransport = configureTraceTransport({ source: 'test', clock: 'mono:test', runtime: 'test', send: record => records.push(record) })
  })

  afterEach(() => {
    stopTransport?.()
    records.length = 0
  })

  function spanRecords() {
    return records.filter(record => record.type === 'span.begin' || record.type === 'span.update' || record.type === 'span.end')
  }

  it('records a completed VAD span for each detected speech segment', async () => {
    const { useVAD } = await import('./vad')
    const vad = useVAD('vad-worker-url')

    await vad.init()
    vadMocks.handlers.get('speech-start')?.()
    vadMocks.handlers.get('speech-ready')?.({
      buffer: new Float32Array([0.25, -0.25]),
      duration: 1500,
    })

    const [begin, update, end] = spanRecords()
    expect(begin).toMatchObject({ type: 'span.begin', name: VoiceNames.SpeechSegment, track: 'participants/user/speech' })
    expect(update).toMatchObject({ type: 'span.update', attrs: { [VoiceAttributes.SpeechDurationMs]: 1500 } })
    expect(end).toMatchObject({ type: 'span.end', status: 'ok' })
  })

  it('marks an active VAD span as aborted when the session is disposed', async () => {
    const { useVAD } = await import('./vad')
    const vad = useVAD('vad-worker-url')

    await vad.init()
    vadMocks.handlers.get('speech-start')?.()
    vad.dispose()

    const ends = spanRecords().filter(record => record.type === 'span.end')
    expect(ends).toHaveLength(1)
    expect(ends[0]).toMatchObject({ status: 'cancelled', attrs: { [VoiceAttributes.VADAborted]: true } })
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

  it('forwards canceled speech only to the dedicated cancel handler', async () => {
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

  it('waits for the same initialization when two consumers start together', async () => {
    let releaseInitialize!: () => void
    vadMocks.initialize.mockImplementationOnce(() => new Promise<undefined>((resolve) => {
      releaseInitialize = () => resolve(undefined)
    }))

    const { useVAD } = await import('./vad')
    const vad = useVAD('vad-worker-url')
    const first = vad.init()
    const second = vad.init()
    let secondCompleted = false
    void second.then(() => {
      secondCompleted = true
    })

    await vi.waitFor(() => expect(vadMocks.initialize).toHaveBeenCalledOnce())
    expect(secondCompleted).toBe(false)

    releaseInitialize()
    await Promise.all([first, second])

    expect(vad.loaded.value).toBe(true)
    expect(vadMocks.createVAD).toHaveBeenCalledOnce()
  })

  it('does not install a VAD manager after disposal during initialization', async () => {
    let releaseInitialize!: () => void
    vadMocks.initialize.mockImplementationOnce(() => new Promise<undefined>((resolve) => {
      releaseInitialize = () => resolve(undefined)
    }))

    const { useVAD } = await import('./vad')
    const vad = useVAD('vad-worker-url')
    const initialization = vad.init()
    await vi.waitFor(() => expect(vadMocks.initialize).toHaveBeenCalledOnce())

    vad.dispose()
    releaseInitialize()
    await initialization

    expect(vad.loaded.value).toBe(false)
    expect(vadMocks.dispose).toHaveBeenCalledOnce()
  })

  it('releases a VAD input graph that starts after disposal', async () => {
    let releaseStart!: () => void
    vadMocks.start.mockImplementationOnce(() => new Promise<undefined>((resolve) => {
      releaseStart = () => resolve(undefined)
    }))

    const { useVAD } = await import('./vad')
    const vad = useVAD('vad-worker-url')
    await vad.init()
    const starting = vad.start({} as MediaStream)
    await vi.waitFor(() => expect(vadMocks.start).toHaveBeenCalledOnce())

    vad.dispose()
    releaseStart()
    await starting

    expect(vadMocks.dispose).toHaveBeenCalledTimes(2)
  })
})

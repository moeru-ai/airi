import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref, shallowRef } from 'vue'

const audioRecorderMock = vi.hoisted(() => ({
  isRecording: undefined as unknown as { value: boolean },
  startRecord: vi.fn(),
  stopRecord: vi.fn(),
  onStopRecordHook: undefined as ((recording: Blob | undefined) => Promise<void>) | undefined,
}))

const vadMock = vi.hoisted(() => ({
  options: undefined as {
    onSpeechStart?: () => void
    onSpeechEnd?: () => void
    onSpeechReady?: (event: { buffer: Float32Array, duration: number }) => void
    minSilenceDurationMs?: number
  } | undefined,
}))

const hearingPipelineMock = vi.hoisted(() => ({
  transcribeForRecording: vi.fn(async (_recording: Blob | null | undefined) => ''),
}))

vi.mock('../../workers/vad/process.worklet?worker&url', () => ({
  default: 'vad-worklet-url',
}))

vi.mock('../../stores/ai/models/vad', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue')

  return {
    useVAD: (_workerUrl: string, options: typeof vadMock.options) => {
      vadMock.options = options
      return {
        init: vi.fn(),
        dispose: vi.fn(),
        start: vi.fn(),
        loaded: vue.ref(true),
        isSpeech: vue.ref(false),
        isSpeechProb: vue.ref(0),
        isSpeechHistory: vue.ref([]),
        inferenceError: vue.ref(),
        minSilenceDurationMs: vue.toRef(options?.minSilenceDurationMs ?? 1200),
      }
    },
  }
})

vi.mock('../../stores/modules/hearing', () => ({
  useHearingSpeechInputPipeline: () => ({
    transcribeForRecording: hearingPipelineMock.transcribeForRecording,
  }),
}))

vi.mock('./audio-recorder', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue')
  audioRecorderMock.isRecording = vue.ref(false)

  return {
    useAudioRecorder: () => ({
      isRecording: audioRecorderMock.isRecording,
      startRecord: audioRecorderMock.startRecord,
      stopRecord: audioRecorderMock.stopRecord,
      onStopRecord: vi.fn((hook: (recording: Blob | undefined) => Promise<void>) => {
        audioRecorderMock.onStopRecordHook = hook
        return vi.fn()
      }),
    }),
  }
})

function createMediaStream() {
  return {
    getAudioTracks: () => ([{} as MediaStreamTrack]),
  } as MediaStream
}

describe('useVoiceInputSession', () => {
  afterEach(() => {
    audioRecorderMock.isRecording.value = false
    audioRecorderMock.onStopRecordHook = undefined
    vadMock.options = undefined
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    audioRecorderMock.startRecord.mockReset()
    audioRecorderMock.stopRecord.mockReset()
    hearingPipelineMock.transcribeForRecording.mockReset().mockResolvedValue('')
  })

  // https://github.com/moeru-ai/airi/issues/2092
  it('issue #2092 transcribes the padded VAD buffer instead of the recorder-only segment', async () => {
    const { useVoiceInputSession } = await import('./voice-input-session')
    const recorderRecording = new Blob(['recorder-only'], { type: 'audio/wav' })
    const onTranscriptionResult = vi.fn()

    hearingPipelineMock.transcribeForRecording.mockResolvedValueOnce('transcribed')
    audioRecorderMock.startRecord.mockImplementation(async () => {
      audioRecorderMock.isRecording.value = true
    })
    audioRecorderMock.stopRecord.mockImplementation(async () => {
      audioRecorderMock.isRecording.value = false
      await audioRecorderMock.onStopRecordHook?.(recorderRecording)
    })

    const session = useVoiceInputSession(shallowRef(createMediaStream()), {
      volumeFallback: { enabled: false },
      onTranscriptionResult,
    })

    await expect(session.startSegment('vad')).resolves.toBe(true)

    vadMock.options?.onSpeechEnd?.()
    vadMock.options?.onSpeechReady?.({
      buffer: new Float32Array([0.5, -0.5]),
      duration: 0.125,
    })

    await vi.waitFor(() => expect(hearingPipelineMock.transcribeForRecording).toHaveBeenCalledOnce())

    const recording = hearingPipelineMock.transcribeForRecording.mock.calls[0]?.[0]
    expect(recording).toBeInstanceOf(Blob)
    expect(recording).not.toBe(recorderRecording)
    expect(recording).toMatchObject({ size: 48, type: 'audio/wav' })

    const wav = new DataView(await recording!.arrayBuffer())
    expect(String.fromCharCode(...new Uint8Array(wav.buffer, 0, 4))).toBe('RIFF')
    expect(wav.getUint32(24, true)).toBe(16000)
    expect(wav.getInt16(44, true)).toBe(16383)
    expect(wav.getInt16(46, true)).toBe(-16384)
    expect(onTranscriptionResult).toHaveBeenCalledWith(expect.objectContaining({
      trigger: 'vad',
      recording,
      text: 'transcribed',
    }))
  })

  // https://github.com/moeru-ai/airi/issues/2092
  it.each(['manual', 'volume'] as const)('issue #2092 keeps %s segments on the recorder-provided audio', async (trigger) => {
    const { useVoiceInputSession } = await import('./voice-input-session')
    const recorderRecording = new Blob(['manual'], { type: 'audio/wav' })

    audioRecorderMock.startRecord.mockImplementation(async () => {
      audioRecorderMock.isRecording.value = true
    })
    audioRecorderMock.stopRecord.mockImplementation(async () => {
      audioRecorderMock.isRecording.value = false
      await audioRecorderMock.onStopRecordHook?.(recorderRecording)
    })

    const session = useVoiceInputSession(shallowRef(createMediaStream()), {
      volumeFallback: { enabled: false },
    })

    await expect(session.startSegment(trigger)).resolves.toBe(true)
    await expect(session.stopSegment(trigger)).resolves.toBeUndefined()
    await vi.waitFor(() => expect(hearingPipelineMock.transcribeForRecording).toHaveBeenCalledOnce())

    expect(hearingPipelineMock.transcribeForRecording).toHaveBeenCalledWith(recorderRecording)
  })

  it('clears the active recorder segment when discarding fails during stop', async () => {
    const { useVoiceInputSession } = await import('./voice-input-session')

    audioRecorderMock.startRecord.mockImplementation(async () => {
      audioRecorderMock.isRecording.value = true
    })
    audioRecorderMock.stopRecord.mockImplementationOnce(async () => {
      audioRecorderMock.isRecording.value = false
      throw new Error('finalize failed')
    })

    const session = useVoiceInputSession(shallowRef(createMediaStream()), {
      volumeFallback: { enabled: false },
    })

    await expect(session.startSegment('manual')).resolves.toBe(true)
    expect(session.activeRecordingTrigger.value).toBe('manual')

    await expect(session.stop({ flushActiveRecording: false })).rejects.toThrow('finalize failed')

    expect(session.activeRecordingTrigger.value).toBeUndefined()
  })

  it('reports a failed recorder start without leaving an active segment', async () => {
    const { useVoiceInputSession } = await import('./voice-input-session')
    const startupError = new Error('start failed')

    audioRecorderMock.startRecord.mockRejectedValueOnce(startupError)

    const session = useVoiceInputSession(shallowRef(createMediaStream()), {
      volumeFallback: { enabled: false },
    })

    await expect(session.startSegment('manual')).resolves.toBe(false)

    expect(session.activeRecordingTrigger.value).toBeUndefined()
    expect(session.lastError.value).toBe(startupError)
  })

  it('clears the active segment when the caller start gate rejects', async () => {
    const { useVoiceInputSession } = await import('./voice-input-session')
    const gateError = new Error('gate failed')

    const session = useVoiceInputSession(shallowRef(createMediaStream()), {
      volumeFallback: { enabled: false },
      canStartSegment: vi.fn()
        .mockRejectedValueOnce(gateError)
        .mockResolvedValueOnce(true),
    })

    await expect(session.startSegment('manual')).resolves.toBe(false)

    expect(session.activeRecordingTrigger.value).toBeUndefined()
    expect(session.lastError.value).toBe(gateError)

    audioRecorderMock.startRecord.mockImplementationOnce(async () => {
      audioRecorderMock.isRecording.value = true
    })

    await expect(session.startSegment('manual')).resolves.toBe(true)
    expect(session.activeRecordingTrigger.value).toBe('manual')
  })

  it('clears the active segment when the caller start hook rejects', async () => {
    const { useVoiceInputSession } = await import('./voice-input-session')
    const hookError = new Error('start hook failed')

    const session = useVoiceInputSession(shallowRef(createMediaStream()), {
      volumeFallback: { enabled: false },
      onSegmentStart: vi.fn().mockRejectedValueOnce(hookError),
    })

    await expect(session.startSegment('manual')).resolves.toBe(false)

    expect(audioRecorderMock.startRecord).not.toHaveBeenCalled()
    expect(session.activeRecordingTrigger.value).toBeUndefined()
    expect(session.lastError.value).toBe(hookError)
  })

  it('stops and clears the recorder when the caller started hook rejects', async () => {
    const { useVoiceInputSession } = await import('./voice-input-session')
    const hookError = new Error('started hook failed')

    audioRecorderMock.startRecord.mockImplementation(async () => {
      audioRecorderMock.isRecording.value = true
    })
    audioRecorderMock.stopRecord.mockImplementation(async () => {
      audioRecorderMock.isRecording.value = false
    })

    const session = useVoiceInputSession(shallowRef(createMediaStream()), {
      volumeFallback: { enabled: false },
      onSegmentStarted: vi.fn().mockRejectedValueOnce(hookError),
    })

    await expect(session.startSegment('manual')).resolves.toBe(false)

    expect(audioRecorderMock.stopRecord).toHaveBeenCalledOnce()
    expect(session.isRecording.value).toBe(false)
    expect(session.activeRecordingTrigger.value).toBeUndefined()
    expect(session.lastError.value).toBe(hookError)
  })

  it('finalizes the recorder when the caller stop hook rejects', async () => {
    const { useVoiceInputSession } = await import('./voice-input-session')
    const hookError = new Error('stop hook failed')
    const onTranscriptionError = vi.fn()

    audioRecorderMock.startRecord.mockImplementation(async () => {
      audioRecorderMock.isRecording.value = true
    })
    audioRecorderMock.stopRecord.mockImplementation(async () => {
      audioRecorderMock.isRecording.value = false
    })

    const session = useVoiceInputSession(shallowRef(createMediaStream()), {
      volumeFallback: { enabled: false },
      onSegmentStop: vi.fn().mockRejectedValueOnce(hookError),
      onTranscriptionError,
    })

    await expect(session.startSegment('manual')).resolves.toBe(true)
    await expect(session.stopSegment('manual')).resolves.toBeUndefined()

    expect(audioRecorderMock.stopRecord).toHaveBeenCalledOnce()
    expect(session.isRecording.value).toBe(false)
    expect(session.activeRecordingTrigger.value).toBeUndefined()
    expect(session.lastError.value).toBe(hookError)
    expect(onTranscriptionError).toHaveBeenCalledWith(expect.objectContaining({ error: hookError }))
  })

  it('stops an active recorder segment after stream mode becomes enabled', async () => {
    const { useVoiceInputSession } = await import('./voice-input-session')
    const shouldUseStreamInput = ref(false)

    audioRecorderMock.startRecord.mockImplementation(async () => {
      audioRecorderMock.isRecording.value = true
    })
    audioRecorderMock.stopRecord.mockImplementation(async () => {
      audioRecorderMock.isRecording.value = false
    })

    const session = useVoiceInputSession(shallowRef(createMediaStream()), {
      shouldUseStreamInput,
      volumeFallback: { enabled: false },
    })

    await expect(session.startSegment('manual')).resolves.toBe(true)
    shouldUseStreamInput.value = true
    await session.stopSegment('manual')

    expect(audioRecorderMock.stopRecord).toHaveBeenCalledOnce()
    expect(session.isRecording.value).toBe(false)
    expect(session.activeRecordingTrigger.value).toBeUndefined()
  })

  it('lets volume fallback finalize a VAD-owned segment after silence', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)

    const animationFrames: FrameRequestCallback[] = []
    const stopRecord = audioRecorderMock.stopRecord.mockImplementation(async () => {
      audioRecorderMock.isRecording.value = false
    })
    audioRecorderMock.startRecord.mockImplementation(async () => {
      audioRecorderMock.isRecording.value = true
    })

    class FakeAudioContext {
      state: AudioContextState = 'running'
      destination = {}

      createMediaStreamSource() {
        return {
          connect: vi.fn(),
          disconnect: vi.fn(),
        }
      }

      createAnalyser() {
        return {
          fftSize: 512,
          smoothingTimeConstant: 0,
          connect: vi.fn(),
          disconnect: vi.fn(),
          getByteTimeDomainData: (data: Uint8Array<ArrayBuffer>) => data.fill(128),
        }
      }

      createGain() {
        return {
          gain: { value: 1 },
          connect: vi.fn(),
          disconnect: vi.fn(),
        }
      }

      resume = vi.fn()
      close = vi.fn()
    }

    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback)
      return animationFrames.length
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const { useVoiceInputSession } = await import('./voice-input-session')
    const session = useVoiceInputSession(shallowRef(createMediaStream()), {
      vad: { minSilenceDurationMs: 20 },
      volumeFallback: {
        enabled: true,
        stopDelayMs: 10,
      },
    })

    await expect(session.startSegment('vad')).resolves.toBe(true)
    await session.startAutoSegmentation()

    animationFrames.shift()?.(1000)
    vi.setSystemTime(1011)
    animationFrames.shift()?.(1011)
    await Promise.resolve()

    expect(stopRecord).not.toHaveBeenCalled()

    vi.setSystemTime(1031)
    animationFrames.shift()?.(1031)
    await Promise.resolve()

    expect(stopRecord).toHaveBeenCalledOnce()
    expect(session.activeRecordingTrigger.value).toBeUndefined()
  })
})

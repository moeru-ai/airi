import { afterEach, describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'

const audioRecorderMock = vi.hoisted(() => ({
  isRecording: undefined as unknown as { value: boolean },
  startRecord: vi.fn(),
  stopRecord: vi.fn(),
}))

vi.mock('../../workers/vad/process.worklet?worker&url', () => ({
  default: 'vad-worklet-url',
}))

vi.mock('../../stores/ai/models/vad', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue')

  return {
    useVAD: () => ({
      init: vi.fn(),
      dispose: vi.fn(),
      start: vi.fn(),
      loaded: vue.ref(true),
      isSpeech: vue.ref(false),
      isSpeechProb: vue.ref(0),
      isSpeechHistory: vue.ref([]),
      inferenceError: vue.ref(),
    }),
  }
})

vi.mock('../../stores/modules/hearing', () => ({
  useHearingSpeechInputPipeline: () => ({
    transcribeForRecording: vi.fn(async () => ''),
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
      onStopRecord: vi.fn(),
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
    vi.clearAllMocks()
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
})

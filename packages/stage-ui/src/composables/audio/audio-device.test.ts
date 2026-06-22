import { afterEach, describe, expect, it, vi } from 'vitest'

const vueUseMock = vi.hoisted(() => ({
  audioInputs: undefined as unknown as { value: MediaDeviceInfo[] },
  ensurePermissions: vi.fn(async () => {}),
  startUserMediaStream: vi.fn(),
  stopStream: vi.fn(),
}))

vi.mock('@vueuse/core', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue')
  vueUseMock.audioInputs = vue.ref<MediaDeviceInfo[]>([])

  return {
    useDevicesList: () => ({
      audioInputs: vueUseMock.audioInputs,
      permissionGranted: vue.ref(false),
      ensurePermissions: vueUseMock.ensurePermissions,
    }),
    useUserMedia: ({ constraints }: { constraints: { value: MediaStreamConstraints } }) => ({
      stream: vue.shallowRef<MediaStream>(),
      stop: vueUseMock.stopStream,
      start: () => vueUseMock.startUserMediaStream(constraints.value),
    }),
  }
})

function createAudioInput(deviceId: string): MediaDeviceInfo {
  return {
    deviceId,
    groupId: '',
    kind: 'audioinput',
    label: deviceId,
    toJSON: () => ({}),
  }
}

function createDeviceNotFoundError() {
  const error = new Error('Requested device not found')
  error.name = 'NotFoundError'
  return error
}

describe('useAudioDevice', () => {
  afterEach(() => {
    vueUseMock.audioInputs.value = []
    vi.clearAllMocks()
  })

  it('recognizes browser device-not-found errors that are not Error instances', async () => {
    const { isMissingAudioInputDeviceError } = await import('./audio-device')

    expect(isMissingAudioInputDeviceError({ name: 'NotFoundError' })).toBe(true)
    expect(isMissingAudioInputDeviceError({ message: 'Requested device not found' })).toBe(true)
  })

  it('retries with the system default microphone when a persisted device id is stale', async () => {
    const { useAudioDevice } = await import('./audio-device')
    const { selectedAudioInput, startStream } = useAudioDevice()
    selectedAudioInput.value = 'stale-device-id'

    vueUseMock.startUserMediaStream
      .mockRejectedValueOnce(createDeviceNotFoundError())
      .mockResolvedValueOnce(undefined)

    await startStream()

    expect(selectedAudioInput.value).toBe('')
    expect(vueUseMock.startUserMediaStream).toHaveBeenNthCalledWith(1, {
      audio: {
        autoGainControl: true,
        deviceId: { exact: 'stale-device-id' },
        echoCancellation: true,
        noiseSuppression: true,
      },
    })
    expect(vueUseMock.startUserMediaStream).toHaveBeenNthCalledWith(2, {
      audio: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })
  })

  it('prefers an enumerated default input before falling back to unconstrained audio', async () => {
    vueUseMock.audioInputs.value = [
      createAudioInput('default'),
      createAudioInput('microphone-1'),
    ]

    const { useAudioDevice } = await import('./audio-device')
    const { selectedAudioInput, startStream } = useAudioDevice()
    selectedAudioInput.value = 'stale-device-id'

    vueUseMock.startUserMediaStream.mockResolvedValueOnce(undefined)

    await startStream()

    expect(selectedAudioInput.value).toBe('default')
    expect(vueUseMock.startUserMediaStream).toHaveBeenCalledWith({
      audio: {
        autoGainControl: true,
        deviceId: { exact: 'default' },
        echoCancellation: true,
        noiseSuppression: true,
      },
    })
  })
})

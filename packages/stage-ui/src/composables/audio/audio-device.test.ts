import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const audioDeviceMock = vi.hoisted(() => ({
  audioInputsRef: undefined as unknown as { value: MediaDeviceInfo[] },
  ensurePermissions: vi.fn(),
  startStream: vi.fn(),
  stopStream: vi.fn(),
  trackAudioDeviceUnavailable: vi.fn(),
  trackMicrophonePermissionDenied: vi.fn(),
  trackMicrophonePermissionRequested: vi.fn(),
}))

vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue')

  audioDeviceMock.audioInputsRef = ref([])

  return {
    useDevicesList: () => ({
      audioInputs: audioDeviceMock.audioInputsRef,
      permissionGranted: ref(false),
      ensurePermissions: audioDeviceMock.ensurePermissions,
    }),
    useUserMedia: () => ({
      stream: ref(undefined),
      stop: audioDeviceMock.stopStream,
      start: audioDeviceMock.startStream,
    }),
  }
})

vi.mock('../use-analytics', () => ({
  useAnalytics: () => ({
    trackAudioDeviceUnavailable: audioDeviceMock.trackAudioDeviceUnavailable,
    trackMicrophonePermissionDenied: audioDeviceMock.trackMicrophonePermissionDenied,
    trackMicrophonePermissionRequested: audioDeviceMock.trackMicrophonePermissionRequested,
  }),
}))

describe('useAudioDevice analytics lifecycle', () => {
  beforeEach(() => {
    if (audioDeviceMock.audioInputsRef)
      audioDeviceMock.audioInputsRef.value = []
    audioDeviceMock.ensurePermissions.mockReset()
    audioDeviceMock.trackAudioDeviceUnavailable.mockReset()
    audioDeviceMock.trackMicrophonePermissionDenied.mockReset()
    audioDeviceMock.trackMicrophonePermissionRequested.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /**
   * @example
   * await expect(askPermission()).rejects.toThrow()
   */
  it('tracks microphone permission denial without exposing browser error text', async () => {
    const { useAudioDevice } = await import('./audio-device')
    const permissionError = new DOMException('User denied microphone', 'NotAllowedError')
    audioDeviceMock.ensurePermissions.mockRejectedValue(permissionError)

    const { askPermission } = useAudioDevice()

    await expect(askPermission()).rejects.toThrow(permissionError)

    expect(audioDeviceMock.trackMicrophonePermissionRequested).toHaveBeenCalledWith({
      stt_provider_id: 'unknown',
    })
    expect(audioDeviceMock.trackMicrophonePermissionDenied).toHaveBeenCalledWith({
      stt_provider_id: 'unknown',
      error_code: 'permission_denied',
    })
    expect(audioDeviceMock.trackAudioDeviceUnavailable).not.toHaveBeenCalled()
  })

  /**
   * @example
   * await askPermission()
   * expect(trackAudioDeviceUnavailable).toHaveBeenCalledWith(expect.objectContaining({ error_code: 'device_unavailable' }))
   */
  it('tracks successful permission requests that still expose no microphone devices', async () => {
    const { useAudioDevice } = await import('./audio-device')
    audioDeviceMock.ensurePermissions.mockResolvedValue(undefined)

    const { askPermission } = useAudioDevice()

    await askPermission()

    expect(audioDeviceMock.trackMicrophonePermissionRequested).toHaveBeenCalledWith({
      stt_provider_id: 'unknown',
    })
    expect(audioDeviceMock.trackAudioDeviceUnavailable).toHaveBeenCalledWith({
      stt_provider_id: 'unknown',
      error_code: 'device_unavailable',
    })
    expect(audioDeviceMock.trackMicrophonePermissionDenied).not.toHaveBeenCalled()
  })
})

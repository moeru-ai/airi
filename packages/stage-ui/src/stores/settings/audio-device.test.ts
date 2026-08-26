import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const storageMock = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
}))

const audioDeviceMock = vi.hoisted(() => ({
  audioInputs: { value: [] as MediaDeviceInfo[] },
  permissionGranted: undefined as unknown as { value: boolean },
  selectedAudioInput: { value: '' },
  startStream: vi.fn(),
  stopStream: vi.fn(),
  askPermission: vi.fn(),
}))

vi.mock('@proj-airi/stage-shared/composables', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue')

  return {
    useLocalStorageManualReset: <T>(key: string, initialValue: T) => {
      const value = vue.ref((storageMock.values.has(key) ? storageMock.values.get(key) : initialValue) as T)

      storageMock.values.set(key, value.value)
      vue.watch(value, (newValue) => {
        storageMock.values.set(key, newValue)
      }, { flush: 'sync' })

      return Object.assign(value, {
        reset: () => {
          value.value = initialValue
        },
      })
    },
  }
})

vi.mock('../../composables/audio', async () => {
  const vue = await vi.importActual<typeof import('vue')>('vue')
  audioDeviceMock.permissionGranted = vue.ref(false)

  return {
    useAudioDevice: () => ({
      audioInputs: audioDeviceMock.audioInputs,
      deviceConstraints: vue.computed(() => ({ audio: true })),
      permissionGranted: audioDeviceMock.permissionGranted,
      selectedAudioInput: audioDeviceMock.selectedAudioInput,
      startStream: audioDeviceMock.startStream,
      stopStream: audioDeviceMock.stopStream,
      stream: vue.shallowRef<MediaStream>(),
      askPermission: audioDeviceMock.askPermission,
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

describe('store settings-audio-devices', () => {
  beforeEach(() => {
    setActivePinia(createTestingPinia({ createSpy: vi.fn, stubActions: false }))
    storageMock.values.clear()
    audioDeviceMock.audioInputs.value = []
    if (audioDeviceMock.permissionGranted)
      audioDeviceMock.permissionGranted.value = false
    audioDeviceMock.selectedAudioInput.value = ''
    vi.resetAllMocks()
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('starts with the persisted microphone instead of overwriting it with the runtime default', async () => {
    storageMock.values.set('settings/audio/input', 'microphone-1')
    storageMock.values.set('settings/audio/input/enabled', true)
    audioDeviceMock.audioInputs.value = [
      createAudioInput('default'),
      createAudioInput('microphone-1'),
    ]
    audioDeviceMock.selectedAudioInput.value = 'default'

    const startedWith: string[] = []
    audioDeviceMock.startStream.mockImplementation(async () => {
      startedWith.push(audioDeviceMock.selectedAudioInput.value)
    })

    const { useSettingsAudioDevice } = await import('./audio-device')
    const store = useSettingsAudioDevice()

    store.initialize()
    await Promise.resolve()

    expect(startedWith).toEqual(['microphone-1'])
    expect(store.selectedAudioInput).toBe('microphone-1')
    expect(storageMock.values.get('settings/audio/input')).toBe('microphone-1')
  })

  it('exposes permission state from the audio device that owns selection', async () => {
    audioDeviceMock.audioInputs.value = [createAudioInput('microphone-1')]
    audioDeviceMock.selectedAudioInput.value = 'microphone-1'
    audioDeviceMock.askPermission.mockImplementation(async () => {
      audioDeviceMock.permissionGranted.value = true
    })

    const { useSettingsAudioDevice } = await import('./audio-device')
    const store = useSettingsAudioDevice()

    expect(store.permissionGranted).toBe(false)

    await store.askPermission()

    expect(store.permissionGranted).toBe(true)
    expect(store.selectedAudioInput).toBe('microphone-1')
  })

  /** @example A rapid off/on toggle keeps using the pending browser microphone request. */
  it('reuses a pending microphone start after disable and re-enable', async () => {
    const { useSettingsAudioDevice } = await import('./audio-device')
    const store = useSettingsAudioDevice()

    let resolveStart!: () => void
    audioDeviceMock.startStream.mockImplementation(() => new Promise<void>((resolve) => {
      resolveStart = resolve
    }))

    store.enabled = true
    await nextTick()

    store.enabled = false
    await nextTick()

    store.enabled = true
    await nextTick()

    /** @example Rapid toggles do not allocate another stream while the first request is pending. */
    expect(audioDeviceMock.startStream).toHaveBeenCalledTimes(1)

    resolveStart()
    await Promise.resolve()
    await nextTick()

    /** @example The re-enabled microphone remains active after the shared request succeeds. */
    expect(store.enabled).toBe(true)
    /** @example Disabling still stops the previously requested stream once. */
    expect(audioDeviceMock.stopStream).toHaveBeenCalledTimes(1)
  })

  /**
   * @example
   * Concurrent page and store consumers share one pending browser microphone request.
   */
  // https://github.com/moeru-ai/airi/pull/2004#discussion_r3560276717
  it('reuses an in-flight microphone start for PR #2004', async () => {
    const { useSettingsAudioDevice } = await import('./audio-device')
    const store = useSettingsAudioDevice()

    let resolveStart!: () => void
    const pendingStart = new Promise<void>((resolve) => {
      resolveStart = resolve
    })
    audioDeviceMock.startStream.mockReturnValue(pendingStart)

    const firstStart = store.startStream()
    const secondStart = store.startStream()

    // ROOT CAUSE:
    //
    // The store previously forwarded every caller to VueUse while stream.value was still empty.
    // VueUse only guards completed streams, so concurrent calls created separate getUserMedia requests.
    // We fixed this by sharing the pending store-owned startup promise until it settles.
    /** @example Only one getUserMedia-backed operation starts while it remains pending. */
    expect(audioDeviceMock.startStream).toHaveBeenCalledTimes(1)

    resolveStart()
    await Promise.all([firstStart, secondStart])

    /** @example Both callers complete through the same underlying startup. */
    expect(audioDeviceMock.startStream).toHaveBeenCalledTimes(1)
  })
})

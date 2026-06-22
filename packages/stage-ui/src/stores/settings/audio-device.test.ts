import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

const storageMock = vi.hoisted(() => ({
  values: new Map<string, unknown>(),
}))

const audioDeviceMock = vi.hoisted(() => ({
  audioInputs: { value: [] as MediaDeviceInfo[] },
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

  return {
    useAudioDevice: () => ({
      audioInputs: audioDeviceMock.audioInputs,
      deviceConstraints: vue.computed(() => ({ audio: true })),
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
    audioDeviceMock.selectedAudioInput.value = ''
    vi.clearAllMocks()
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

  it('ignores stale microphone startup failures after a newer start succeeds', async () => {
    const { useSettingsAudioDevice } = await import('./audio-device')
    const store = useSettingsAudioDevice()

    let rejectFirstStart!: (error: unknown) => void
    let resolveSecondStart!: () => void
    audioDeviceMock.startStream
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
        rejectFirstStart = reject
      }))
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveSecondStart = resolve
      }))

    store.enabled = true
    await nextTick()

    store.enabled = false
    await nextTick()

    store.enabled = true
    await nextTick()

    resolveSecondStart()
    await Promise.resolve()

    rejectFirstStart(new Error('old startup failed'))
    await Promise.resolve()
    await nextTick()

    expect(store.enabled).toBe(true)
    expect(audioDeviceMock.stopStream).toHaveBeenCalledTimes(1)
  })
})

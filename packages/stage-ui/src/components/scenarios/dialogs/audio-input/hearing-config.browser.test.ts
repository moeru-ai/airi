import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

import HearingConfig from './hearing-config.vue'

import { useSettingsAudioDevice } from '../../../../stores/settings/audio-device'

const audioDeviceMocks = vi.hoisted(() => ({
  componentAskPermission: vi.fn(),
  storeAskPermission: vi.fn(),
}))

function createAudioInput(deviceId: string, label: string): MediaDeviceInfo {
  return {
    deviceId,
    groupId: '',
    kind: 'audioinput',
    label,
    toJSON: () => ({}),
  }
}

vi.mock('../../../../composables/audio', async () => {
  const { computed, ref, shallowRef } = await vi.importActual<typeof import('vue')>('vue')
  const permissionGranted = ref(false)

  audioDeviceMocks.storeAskPermission.mockImplementation(async () => {
    permissionGranted.value = true
  })

  return {
    useAudioDevice: () => ({
      audioInputs: ref([createAudioInput('store-microphone', 'Store microphone')]),
      audioInputOptions: computed(() => [
        { label: 'Store microphone', value: 'store-microphone' },
      ]),
      selectedAudioInput: ref('store-microphone'),
      stream: shallowRef<MediaStream>(),
      deviceConstraints: computed(() => ({ audio: true })),
      permissionGranted,
      askPermission: audioDeviceMocks.storeAskPermission,
      startStream: vi.fn().mockResolvedValue(undefined),
      stopStream: vi.fn(),
    }),
  }
})

vi.mock('../../../../composables', async () => {
  const { ref } = await vi.importActual<typeof import('vue')>('vue')
  const permissionGranted = ref(false)

  audioDeviceMocks.componentAskPermission.mockImplementation(async () => {
    permissionGranted.value = true
  })

  return {
    useAudioAnalyzer: () => ({ volumeLevel: ref(0) }),
    useAudioDevice: () => ({
      audioInputs: ref([createAudioInput('detached-microphone', 'Detached microphone')]),
      permissionGranted,
      askPermission: audioDeviceMocks.componentAskPermission,
    }),
  }
})

vi.mock('../../../../stores', async () => {
  const { useSettingsAudioDevice } = await import('../../../../stores/settings/audio-device')
  return { useSettingsAudioDevice }
})

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

function mountHearingConfig() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(HearingConfig, { granted: true })
  const pinia = createPinia()
  app.use(pinia)
  app.mount(host)

  return { app, host, store: useSettingsAudioDevice(pinia) }
}

describe('hearing config audio device ownership', () => {
  beforeEach(() => {
    audioDeviceMocks.componentAskPermission.mockClear()
    audioDeviceMocks.storeAskPermission.mockClear()
    localStorage.clear()
  })

  it('does not request microphone permission when viewing input settings', async () => {
    const { app, host } = mountHearingConfig()
    await nextTick()

    expect(audioDeviceMocks.storeAskPermission).not.toHaveBeenCalled()
    expect(audioDeviceMocks.componentAskPermission).not.toHaveBeenCalled()

    app.unmount()
    host.remove()
  })

  it('renders the device inventory owned by the settings store', () => {
    const { app, host } = mountHearingConfig()

    expect(host.querySelector<HTMLInputElement>('input')?.value).toBe('Store microphone')
    expect(host.textContent).not.toContain('Detached microphone')

    app.unmount()
    host.remove()
  })

  it('offers four hearing modes while keeping voice messages separate', () => {
    const { app, host } = mountHearingConfig()

    const modes = host.querySelectorAll('[role="radio"]')
    expect(modes).toHaveLength(4)
    expect(host.textContent).toContain('input-mode.off')
    expect(host.textContent).toContain('input-mode.push-to-talk')
    expect(host.textContent).toContain('input-mode.wake-word')
    expect(host.textContent).toContain('input-mode.always')
    expect(host.textContent).not.toContain('settings.pages.modules.hearing.microphone.label')

    app.unmount()
    host.remove()
  })

  it('shows the microphone switch only for continuous hearing modes', async () => {
    const { app, host, store } = mountHearingConfig()
    store.setHearingMode('push-to-talk')
    await nextTick()
    expect(host.querySelector('[role="switch"]')).toBeNull()

    store.setHearingMode('always')
    await nextTick()
    expect(host.querySelector('[role="switch"]')).not.toBeNull()

    app.unmount()
    host.remove()
  })
})

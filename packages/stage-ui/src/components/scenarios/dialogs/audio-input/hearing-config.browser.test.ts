import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

import HearingConfig from './hearing-config.vue'

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

  return {
    useAudioDevice: () => {
      const permissionGranted = ref(false)
      audioDeviceMocks.storeAskPermission.mockImplementation(async () => {
        permissionGranted.value = true
      })

      return {
        audioInputs: ref([createAudioInput('store-microphone', 'Store microphone')]),
        audioInputOptions: computed(() => [
          { label: 'Store microphone', value: 'store-microphone' },
        ]),
        selectedAudioInput: ref('store-microphone'),
        stream: shallowRef<MediaStream>(),
        deviceConstraints: computed(() => ({ audio: true })),
        permissionGranted,
        source: shallowRef(),
        input: shallowRef({ subscribe: () => new ReadableStream() }),
        askPermission: audioDeviceMocks.storeAskPermission,
      }
    },
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

function mountHearingConfig(beforeEnable?: () => Promise<void>) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(HearingConfig, { beforeEnable })
  app.use(createPinia())
  app.mount(host)

  return { app, host }
}

describe('hearing config audio device ownership', () => {
  beforeEach(() => {
    audioDeviceMocks.componentAskPermission.mockClear()
    audioDeviceMocks.storeAskPermission.mockClear()
    localStorage.clear()
  })

  it('requests microphone permission through the settings store', async () => {
    const { app, host } = mountHearingConfig()
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="Enable microphone input"]')

    button?.click()
    await nextTick()

    expect(audioDeviceMocks.storeAskPermission).toHaveBeenCalledOnce()
    expect(audioDeviceMocks.componentAskPermission).not.toHaveBeenCalled()

    app.unmount()
    host.remove()
  })

  it('renders the microphone selected by the settings store', () => {
    localStorage.setItem('settings/audio/input', 'store-microphone')
    const { app, host } = mountHearingConfig()

    expect(host.querySelector<HTMLInputElement>('input[role="combobox"]')?.value).toBe('Store microphone')
    expect(host.textContent).not.toContain('Detached microphone')

    app.unmount()
    host.remove()
  })

  it('waits for permission preparation and ignores repeated enable clicks', async () => {
    const permissionPreparation = Promise.withResolvers<void>()
    const beforeEnable = vi.fn(() => permissionPreparation.promise)
    const { app, host } = mountHearingConfig(beforeEnable)
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="Enable microphone input"]')!

    button.click()
    button.click()
    await nextTick()

    expect(beforeEnable).toHaveBeenCalledOnce()
    expect(button.disabled).toBe(true)
    expect(audioDeviceMocks.storeAskPermission).not.toHaveBeenCalled()

    permissionPreparation.resolve()
    await expect.poll(() => button.getAttribute('aria-label')).toBe('Disable microphone input')

    expect(audioDeviceMocks.storeAskPermission).toHaveBeenCalledOnce()
    expect(button.disabled).toBe(false)

    button.click()
    await nextTick()

    expect(button.getAttribute('aria-label')).toBe('Enable microphone input')
    expect(beforeEnable).toHaveBeenCalledOnce()

    app.unmount()
    host.remove()
  })

  it('keeps capture off after a preparation error and permits another click', async () => {
    const error = new Error('The host permission request failed.')
    const beforeEnable = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined)
    const { app, host } = mountHearingConfig(beforeEnable)
    const onError = vi.fn()
    app.config.errorHandler = onError
    const button = host.querySelector<HTMLButtonElement>('button[aria-label="Enable microphone input"]')!

    button.click()
    await expect.poll(() => onError.mock.calls.length).toBe(1)

    expect(onError.mock.calls[0]?.[0]).toBe(error)
    expect(button.disabled).toBe(false)
    expect(button.getAttribute('aria-label')).toBe('Enable microphone input')
    expect(audioDeviceMocks.storeAskPermission).not.toHaveBeenCalled()

    button.click()
    await expect.poll(() => button.getAttribute('aria-label')).toBe('Disable microphone input')

    expect(beforeEnable).toHaveBeenCalledTimes(2)
    expect(audioDeviceMocks.storeAskPermission).toHaveBeenCalledOnce()

    app.unmount()
    host.remove()
  })
})

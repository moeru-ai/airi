import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { createApp, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'

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
        permission: shallowRef('granted'),
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
  // The microphone settings store reads the Hearing input mode. The Hearing store loads provider metadata, which needs i18n.
  app.use(createPinia()).use(createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false }))
  app.mount(host)

  return { app, host }
}

/** The microphone switch of the controls. Reka renders it as a `role="switch"` button inside the field label. */
function microphoneSwitch(host: HTMLElement) {
  return host.querySelector<HTMLButtonElement>('[data-testid="hearing-microphone-switch"] [role="switch"]')!
}

describe('hearing config audio device ownership', () => {
  beforeEach(() => {
    audioDeviceMocks.componentAskPermission.mockClear()
    audioDeviceMocks.storeAskPermission.mockClear()
    localStorage.clear()
  })

  // The island and the mobile Hearing drawer show these controls. Users must be able to close the microphone there.
  it('turns the microphone off for every feature, and keeps listening waiting until it is on again', async () => {
    const { app, host } = mountHearingConfig()
    const offSwitch = () => host.querySelector<HTMLButtonElement>('[data-testid="hearing-microphone-off-switch"] [role="switch"]')!
    await nextTick()
    expect(offSwitch().getAttribute('aria-checked')).toBe('true')

    offSwitch().click()

    await expect.poll(() => offSwitch().getAttribute('aria-checked')).toBe('false')
    expect(localStorage.getItem('settings/audio/input/off')).toBe('true')
    expect(microphoneSwitch(host).disabled).toBe(true)

    offSwitch().click()

    await expect.poll(() => offSwitch().getAttribute('aria-checked')).toBe('true')
    expect(microphoneSwitch(host).disabled).toBe(false)
    expect(audioDeviceMocks.storeAskPermission).not.toHaveBeenCalled()

    app.unmount()
    host.remove()
  })

  it('does not request microphone permission when the controls render', async () => {
    const { app, host } = mountHearingConfig()
    await nextTick()

    expect(microphoneSwitch(host).getAttribute('aria-checked')).toBe('false')
    expect(audioDeviceMocks.storeAskPermission).not.toHaveBeenCalled()

    app.unmount()
    host.remove()
  })

  it('requests microphone permission through the settings store when the switch turns on', async () => {
    const { app, host } = mountHearingConfig()

    microphoneSwitch(host).click()
    await expect.poll(() => microphoneSwitch(host).getAttribute('aria-checked')).toBe('true')

    expect(audioDeviceMocks.storeAskPermission).toHaveBeenCalledOnce()
    expect(audioDeviceMocks.componentAskPermission).not.toHaveBeenCalled()

    app.unmount()
    host.remove()
  })

  it('renders the microphone selected by the settings store in a select on a wide screen', async () => {
    await page.viewport(1280, 800)
    localStorage.setItem('settings/audio/input', 'store-microphone')
    const { app, host } = mountHearingConfig()

    await expect.poll(() => host.querySelector<HTMLInputElement>('input[role="combobox"]')?.value).toBe('Store microphone')
    expect(host.textContent).not.toContain('Detached microphone')

    app.unmount()
    host.remove()
  })

  // A phone shows this config in a bottom drawer. A select there opened a second floating layer that the drawer
  // and the composer covered, so a narrow screen lists the microphones as rows.
  it('lists the microphones as rows on a narrow screen', async () => {
    await page.viewport(390, 844)
    localStorage.setItem('settings/audio/input', 'store-microphone')
    const { app, host } = mountHearingConfig()

    await expect.poll(() => host.querySelector('[data-testid="microphone-picker"]')?.getAttribute('data-layout')).toBe('list')
    expect(host.querySelector('input[role="combobox"]')).toBeNull()
    expect(host.querySelector('[data-testid="microphone-picker"] [role="radio"][data-state="checked"]')?.textContent).toContain('Store microphone')

    app.unmount()
    host.remove()
  })

  it('keeps the switch off when the permission request fails', async () => {
    audioDeviceMocks.storeAskPermission.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'))
    const { app, host } = mountHearingConfig()

    microphoneSwitch(host).click()
    await expect.poll(() => host.querySelector('[data-testid="hearing-microphone-error"]')).not.toBeNull()

    expect(microphoneSwitch(host).getAttribute('aria-checked')).toBe('false')
    expect(microphoneSwitch(host).disabled).toBe(false)

    app.unmount()
    host.remove()
  })

  it('waits for permission preparation and ignores repeated enable clicks', async () => {
    const permissionPreparation = Promise.withResolvers<void>()
    const beforeEnable = vi.fn(() => permissionPreparation.promise)
    const { app, host } = mountHearingConfig(beforeEnable)
    const toggle = microphoneSwitch(host)

    toggle.click()
    await nextTick()
    toggle.click()
    await nextTick()

    expect(beforeEnable).toHaveBeenCalledOnce()
    expect(toggle.disabled).toBe(true)
    expect(audioDeviceMocks.storeAskPermission).not.toHaveBeenCalled()

    permissionPreparation.resolve()
    await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('true')

    expect(audioDeviceMocks.storeAskPermission).toHaveBeenCalledOnce()
    expect(toggle.disabled).toBe(false)

    toggle.click()
    await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('false')

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
    const toggle = microphoneSwitch(host)

    toggle.click()
    await expect.poll(() => onError.mock.calls.length).toBe(1)

    expect(onError.mock.calls[0]?.[0]).toBe(error)
    expect(toggle.disabled).toBe(false)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(audioDeviceMocks.storeAskPermission).not.toHaveBeenCalled()

    toggle.click()
    await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('true')

    expect(beforeEnable).toHaveBeenCalledTimes(2)
    expect(audioDeviceMocks.storeAskPermission).toHaveBeenCalledOnce()

    app.unmount()
    host.remove()
  })
})

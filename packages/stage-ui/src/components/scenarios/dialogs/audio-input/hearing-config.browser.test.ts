import en from '@proj-airi/i18n/locales/en'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import HearingConfig from './hearing-config.vue'

import { useHearingRuntimeStore } from '../../../../stores/hearing-runtime'
import { useSettingsAudioDevice } from '../../../../stores/settings/audio-device'

function mountHearingConfig() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const screen = render(HearingConfig, {
    props: { granted: true },
    global: {
      plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
  const device = useSettingsAudioDevice(pinia)
  const runtime = useHearingRuntimeStore(pinia)
  return { screen, device, runtime }
}

describe('hearing input settings', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.spyOn(navigator.mediaDevices, 'enumerateDevices').mockResolvedValue([{
      deviceId: 'default',
      groupId: 'microphone',
      kind: 'audioinput',
      label: 'Test microphone',
      toJSON: () => ({}),
    }])
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('does not acquire microphone permission when the settings panel opens', async () => {
    const capture = vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(new MediaStream())
    const { screen, device } = mountHearingConfig()

    await expect.element(screen.getByRole('combobox').first()).toBeVisible()
    expect(capture).not.toHaveBeenCalled()
    expect(device.enabled).toBe(false)
  })

  it('acquires permission through the device store when the microphone switch is enabled', async () => {
    const capture = vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockImplementation(async () => new MediaStream())
    const { screen, device } = mountHearingConfig()

    await screen.getByRole('switch').click()

    await expect.poll(() => device.permissionGranted).toBe(true)
    await expect.poll(() => device.enabled).toBe(true)
    expect(capture).toHaveBeenCalled()
    device.enabled = false
  })

  it('shows calling preparation failures without enabling continuous capture in Push to Talk mode', async () => {
    const capture = vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(new MediaStream())
    const { screen, device, runtime } = mountHearingConfig()
    device.mode = 'wake-word'
    runtime.preparation = 'error'
    runtime.preparationError = 'Model file is unavailable'

    await expect.element(screen.getByText('Model file is unavailable')).toBeVisible()
    device.mode = 'push-to-talk'

    await expect.element(screen.getByRole('switch')).not.toBeInTheDocument()
    await expect.element(screen.getByText('Model file is unavailable')).not.toBeInTheDocument()
    expect(capture).not.toHaveBeenCalled()
  })
})

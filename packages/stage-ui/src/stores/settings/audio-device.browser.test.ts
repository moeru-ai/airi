import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useHearingStore } from '../modules/hearing'
import { useSettingsAudioDevice } from './audio-device'

const cleanups: (() => void)[] = []

function mountDevices() {
  const pinia = createPinia()
  let devices!: ReturnType<typeof useSettingsAudioDevice>
  const app = createApp(defineComponent({ setup() {
    devices = useSettingsAudioDevice()
    return () => h('div')
  } }))
  // The Hearing store loads provider metadata, which reads translations that this test does not need.
  app.use(pinia).use(createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false }))
  const element = document.createElement('div')
  document.body.append(element)
  app.mount(element)
  cleanups.push(() => {
    app.unmount()
    disposePinia(pinia)
    element.remove()
  })
  return devices
}

afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  localStorage.clear()
})

describe('microphone settings through the browser adapter', () => {
  it('shares one microphone between subscribers and releases tracks after both leave', async () => {
    const devices = mountDevices()
    // The device list decides which device the system default opens. Subscribers here start after it settles.
    expect(await devices.askPermission()).toBe(true)
    await expect.poll(() => devices.selectedAudioInput).not.toBe('')
    const first = new AbortController()
    const second = new AbortController()
    const firstReader = devices.input.subscribe({ signal: first.signal }).getReader()
    devices.input.subscribe({ signal: second.signal })
    await firstReader.read()
    const track = devices.stream!.getAudioTracks()[0]
    expect(track.readyState).toBe('live')

    first.abort()
    expect(track.readyState).toBe('live')
    second.abort()

    await expect.poll(() => track.readyState).toBe('ended')
    expect(devices.stream).toBeUndefined()
  })

  it('does not publish a late microphone after the only subscriber left during startup', async () => {
    const devices = mountDevices()
    const subscription = new AbortController()
    devices.input.subscribe({ signal: subscription.signal })
    subscription.abort()

    await new Promise(resolve => setTimeout(resolve, 100))
    expect(devices.stream).toBeUndefined()
  })

  // The Web Speech and Hearing test controls stay disabled while no microphone is selected.
  it('selects the system default microphone after permission', async () => {
    const devices = mountDevices()
    expect(devices.selectedAudioInput).toBe('')

    expect(await devices.askPermission()).toBe(true)

    const available = devices.audioInputOptions.map(option => option.value)
    await expect.poll(() => devices.selectedAudioInput).toBe(available.includes('default') ? 'default' : available[0])
  })

  // ROOT CAUSE:
  //
  // Capture for the selected system default received only zeros on a Mac.
  // The selection `default` became constraints without a device, and Chromium opened its first listed device.
  //
  // We fixed this by asking for the device `default` by name when the browser lists it.
  it('opens the browser default device when the system default is selected', async () => {
    const devices = mountDevices()
    expect(await devices.askPermission()).toBe(true)
    await expect.poll(() => devices.selectedAudioInput).not.toBe('')
    if (devices.selectedAudioInput !== 'default')
      return

    const subscription = new AbortController()
    const reader = devices.input.subscribe({ signal: subscription.signal }).getReader()
    await reader.read()

    expect(devices.stream?.getAudioTracks()[0].getSettings().deviceId).toBe('default')
    subscription.abort()
  })

  it('selects the preferred microphone again after a reset', async () => {
    const devices = mountDevices()
    expect(await devices.askPermission()).toBe(true)
    await expect.poll(() => devices.selectedAudioInput).not.toBe('')
    const preferred = devices.selectedAudioInput

    devices.resetState()

    await expect.poll(() => devices.selectedAudioInput).toBe(preferred)
  })

  it('keeps the microphone closed in Push to Talk mode while microphone input is on', async () => {
    const devices = mountDevices()
    const hearing = useHearingStore()
    expect(await devices.askPermission()).toBe(true)
    await expect.poll(() => devices.selectedAudioInput).not.toBe('')
    await expect.poll(() => devices.stream).toBeUndefined()
    hearing.inputMode = 'push-to-talk'
    devices.enabled = true
    devices.initialize()

    await new Promise(resolve => setTimeout(resolve, 100))
    expect(devices.stream).toBeUndefined()

    hearing.inputMode = 'always-on'
    await expect.poll(() => devices.stream?.getAudioTracks()[0].readyState).toBe('live')
    const track = devices.stream!.getAudioTracks()[0]

    hearing.inputMode = 'push-to-talk'
    await expect.poll(() => track.readyState).toBe('ended')
  })

  it('keeps the selected device and exposes unavailable-device failures', async () => {
    localStorage.setItem('settings/audio/input', 'missing-test-microphone')
    const devices = mountDevices()
    expect(devices.selectedAudioInput).toBe('missing-test-microphone')

    expect(await devices.askPermission()).toBe(false)

    expect(devices.error).toBeTruthy()
    expect(devices.stream).toBeUndefined()
  })
})

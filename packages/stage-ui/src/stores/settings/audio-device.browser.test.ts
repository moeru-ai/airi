import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useSettingsAudioDevice } from './audio-device'

const cleanups: (() => void)[] = []

function mountDevices() {
  const pinia = createPinia()
  let devices!: ReturnType<typeof useSettingsAudioDevice>
  const app = createApp(defineComponent({ setup() {
    devices = useSettingsAudioDevice()
    return () => h('div')
  } }))
  app.use(pinia).use(createI18n({ legacy: false, locale: 'en', messages: { en: {} } }))
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
  it('shares startup and releases tracks after both consumers finish', async () => {
    const devices = mountDevices()
    const firstLease = devices.acquireInput()
    const secondLease = devices.acquireInput()
    const [first, second] = await Promise.all([firstLease.input, secondLease.input])
    expect(first).toBe(second)
    expect(devices.permissionGranted).toBe(true)
    const track = devices.stream!.getAudioTracks()[0]
    expect(track.readyState).toBe('live')
    await firstLease.release()
    expect(track.readyState).toBe('live')
    await secondLease.release()
    expect(devices.input).toBeUndefined()
    expect(devices.stream).toBeUndefined()
    expect(track.readyState).toBe('ended')
  })

  it('does not publish a late source after cancellation during startup', async () => {
    const devices = mountDevices()
    const lease = devices.acquireInput()
    const rejected = expect(lease.input).rejects.toThrow()
    await lease.release()
    await rejected
    expect(devices.input).toBeUndefined()
    expect(devices.stream).toBeUndefined()
  })

  it('keeps the selected device and exposes unavailable-device failures', async () => {
    localStorage.setItem('settings/audio/input', 'missing-test-microphone')
    const devices = mountDevices()
    expect(devices.selectedAudioInput).toBe('missing-test-microphone')
    const lease = devices.acquireInput()
    await expect(lease.input).rejects.toThrow()
    await lease.release()
    expect(devices.input).toBeUndefined()
    expect(devices.stream).toBeUndefined()
  })
})

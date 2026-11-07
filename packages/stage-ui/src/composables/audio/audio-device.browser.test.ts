import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, ref } from 'vue'
import { createI18n } from 'vue-i18n'

import { useAudioDevice } from './audio-device'

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  vi.restoreAllMocks()
})

function mountDevice() {
  const off = ref(false)
  const selected = ref('')
  let device!: ReturnType<typeof useAudioDevice>
  const app = createApp(defineComponent({ setup() {
    device = useAudioDevice(selected, { off })
    return () => h('div')
  } }))
  // Analytics reads a store and translations.
  const pinia = createPinia()
  app.use(pinia).use(createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false })).mount(document.createElement('div'))
  cleanups.push(() => {
    app.unmount()
    disposePinia(pinia)
  })
  return { device, off, selected }
}

// Users must be able to turn the microphone off for every feature, and see the system indicator turn off.
it('closes every capture and opens no new one while the microphone is off', async () => {
  const { device, off, selected } = mountDevice()
  // The device list decides which device the system default opens. A later list change replaces the input.
  await device.askPermission()
  await expect.poll(() => selected.value).not.toBe('')
  const subscription = new AbortController()
  const reader = device.input.value.subscribe({ signal: subscription.signal }).getReader()
  await reader.read()
  const track = device.stream.value!.getAudioTracks()[0]

  off.value = true

  await expect.poll(() => track.readyState).toBe('ended')
  expect(await reader.read()).toEqual({ done: true, value: undefined })
  const openMicrophone = vi.spyOn(navigator.mediaDevices, 'getUserMedia')
  await expect(device.input.value.subscribe().getReader().read()).rejects.toThrow('The microphone is turned off in AIRI')
  await expect(device.unprocessedInput.value.subscribe().getReader().read()).rejects.toThrow('The microphone is turned off in AIRI')
  expect(openMicrophone).not.toHaveBeenCalled()

  off.value = false
  const reopened = new AbortController()
  cleanups.push(() => reopened.abort())
  await device.input.value.subscribe({ signal: reopened.signal }).getReader().read()

  expect(openMicrophone).toHaveBeenCalledOnce()
})

// Wake word and speech input stopped after the microphone was lost, for example an unplugged or busy device.
it('creates new inputs when the track of the selected device ends', async () => {
  // ROOT CAUSE:
  //
  // Inputs were created again only when the device ID changed:
  //
  // watch(capturedDeviceId, () => { source.value = createSource(...) })
  //
  // An ended track ended every subscription, and nothing opened the device again.
  // We fixed this by creating the inputs again when a device track ends.
  const { device, selected } = mountDevice()
  await device.askPermission()
  await expect.poll(() => selected.value).not.toBe('')
  await expect.poll(() => device.audioInputs.value.length).toBeGreaterThan(0)
  const input = device.input.value
  const unprocessedInput = device.unprocessedInput.value
  const subscription = new AbortController()
  cleanups.push(() => subscription.abort())
  const reader = input.subscribe({ signal: subscription.signal }).getReader()
  await reader.read()
  const track = device.stream.value!.getAudioTracks()[0]

  // The browser fires `ended` when the device goes away. `stop()` does not fire it.
  track.dispatchEvent(new Event('ended'))

  expect(await reader.read()).toEqual({ done: true, value: undefined })
  await expect.poll(() => device.input.value).not.toBe(input)
  expect(device.unprocessedInput.value).not.toBe(unprocessedInput)
  const reopened = new AbortController()
  cleanups.push(() => reopened.abort())
  expect((await device.input.value.subscribe({ signal: reopened.signal }).getReader().read()).done).toBe(false)
})

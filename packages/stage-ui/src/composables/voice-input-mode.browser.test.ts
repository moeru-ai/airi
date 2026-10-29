import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, shallowRef } from 'vue'
import { createI18n } from 'vue-i18n'

import { useSettingsAudioDevice } from '../stores/settings/audio-device'
import { useVoiceStore } from '../stores/voice'
import { useVoiceListening } from './voice-input-mode'

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  vi.restoreAllMocks()
  localStorage.clear()
})

/**
 * Runs `useVoiceListening` in a stage page scope. The voice store's listening actions are spied, so the test reads the
 * decision without loading the voice activity model.
 */
function mountListening(continuous: () => boolean, options: { onUnmount?: (unmount: () => void) => void } = {}) {
  const pinia = createPinia()
  const app = createApp({ setup() {
    const voice = useVoiceStore()
    vi.spyOn(voice, 'startListening').mockImplementation(() => {})
    vi.spyOn(voice, 'stopListening').mockResolvedValue()
    useVoiceListening({ continuous })
    return () => null
  } }).use(pinia).use(createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false }))
  app.mount(document.createElement('div'))
  let mounted = true
  const unmount = () => {
    if (mounted)
      app.unmount()
    mounted = false
  }
  options.onUnmount?.(unmount)
  cleanups.push(() => {
    unmount()
    disposePinia(pinia)
  })
  return { voice: useVoiceStore(pinia), devices: useSettingsAudioDevice(pinia) }
}

describe('useVoiceListening', () => {
  it('keeps a small screen silent outside a call, even with the microphone on', async () => {
    localStorage.setItem('settings/audio/input/enabled', 'true')
    const { voice } = mountListening(() => false)
    await nextTick()

    expect(voice.startListening).not.toHaveBeenCalled()
  })

  it('does not listen during a call while the microphone switch is off', async () => {
    localStorage.setItem('settings/audio/input/off', 'true')
    const { voice } = mountListening(() => false)

    voice.startCall()
    await nextTick()

    expect(voice.startListening).not.toHaveBeenCalled()
  })

  it('listens during a call on a small screen, and stops after the call', async () => {
    const { voice } = mountListening(() => false)

    voice.startCall()
    await nextTick()
    expect(voice.startListening).toHaveBeenCalledOnce()

    voice.endCall()
    await nextTick()
    expect(voice.stopListening).toHaveBeenCalled()
  })

  // https://github.com/moeru-ai/airi/pull/3223#discussion_r4410478656
  // Leaving the stage page, for example to settings, disposed listening but kept the call active in the store.
  // The call then listened again without its controls when the page came back.
  it('ends the call when the stage page that listens goes away', async () => {
    let unmount!: () => void
    const { voice } = mountListening(() => false, { onUnmount: value => unmount = value })
    voice.startCall()
    await nextTick()

    unmount()

    expect(voice.callActive).toBe(false)
  })

  // A small screen has no control for the listening preference. A preference from a wide window or an older release
  // still held the microphone open there, with the system indicator on while nothing listened.
  it('does not hold the microphone open on a small screen, even with the listening preference on', async () => {
    localStorage.setItem('settings/audio/input/enabled', 'true')
    const { devices } = mountListening(() => false)
    await nextTick()

    expect(devices.listening).toBe(true)
    expect(devices.heldOpen).toBe(false)
  })

  it('keeps continuous listening running when a call ends on a large screen', async () => {
    localStorage.setItem('settings/audio/input/enabled', 'true')
    const continuous = shallowRef(true)
    const { voice, devices } = mountListening(() => continuous.value)
    await nextTick()
    expect(devices.listening).toBe(true)
    expect(voice.startListening).toHaveBeenCalledOnce()

    voice.startCall()
    await nextTick()
    voice.endCall()
    await nextTick()

    // The decision stayed true through the call, so listening never restarted or stopped.
    expect(voice.startListening).toHaveBeenCalledOnce()
    expect(voice.stopListening).not.toHaveBeenCalled()
  })
})

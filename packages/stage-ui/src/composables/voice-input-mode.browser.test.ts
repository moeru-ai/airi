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
function mountListening(continuous: () => boolean) {
  const pinia = createPinia()
  const app = createApp({ setup() {
    const voice = useVoiceStore()
    vi.spyOn(voice, 'startListening').mockImplementation(() => {})
    vi.spyOn(voice, 'stopListening').mockResolvedValue()
    useVoiceListening({ continuous })
    return () => null
  } }).use(pinia).use(createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false }))
  app.mount(document.createElement('div'))
  cleanups.push(() => {
    app.unmount()
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

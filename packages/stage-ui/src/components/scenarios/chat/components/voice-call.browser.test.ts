import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import VoiceCallCapsule from './voice-call-capsule.vue'

import { trackPendingActions } from '../../../../libs/pinia/pending-actions'
import { useHearingStore } from '../../../../stores/modules/hearing'
import { useSettingsAudioDevice } from '../../../../stores/settings/audio-device'
import { useVoiceStore } from '../../../../stores/voice'
import { useVoiceCallStore } from '../../../../stores/voice-call'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

const cleanups: (() => void | Promise<void>)[] = []

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse())
    await cleanup()
  localStorage.clear()
})

/** Mounts the call capsule, which is the call UI of every layout. The composer owns the mute button. */
async function mountCall() {
  const pinia = createPinia()
  // The speech store loads the voice catalog when it starts. Disposing first leaves that load running into the next test.
  const pendingCatalogLoads = trackPendingActions(pinia, storeId => storeId === 'speech')
  cleanups.push(() => disposePinia(pinia))
  const screen = await render(VoiceCallCapsule, {
    global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })] },
  })
  cleanups.push(() => screen.unmount())
  cleanups.push(async () => {
    await expect.poll(pendingCatalogLoads).toBe(0)
  })
  return { screen, voice: useVoiceStore(pinia), call: useVoiceCallStore(pinia), devices: useSettingsAudioDevice(pinia) }
}

describe('voice call', () => {
  it('does not start without a transcription provider', async () => {
    const { call, voice } = await mountCall()

    expect(await call.start()).toBe('unconfigured')
    expect(voice.callActive).toBe(false)
  })

  it('does not start while the microphone switch is off, and turning it off ends a call', async () => {
    localStorage.setItem('settings/hearing/active-provider', 'browser-web-speech-api')
    const { call, voice, devices } = await mountCall()

    devices.off = true
    expect(await call.start()).toBe('microphone-off')
    expect(voice.callActive).toBe(false)

    devices.off = false
    voice.startCall()
    expect(voice.callActive).toBe(true)
    devices.off = true

    await expect.poll(() => voice.callActive).toBe(false)
  })

  // https://github.com/moeru-ai/airi/pull/3223#discussion_r4410911872
  // A composer recording that started while the permission prompt was open was cancelled when the call began.
  it('does not start while the caller reports a busy composer', async () => {
    localStorage.setItem('settings/hearing/active-provider', 'browser-web-speech-api')
    const { call, voice } = await mountCall()

    expect(await call.start({ canStart: () => false })).toBe('busy')
    expect(voice.callActive).toBe(false)
  })

  it('ends a call when Hearing loses its transcription provider', async () => {
    localStorage.setItem('settings/hearing/active-provider', 'browser-web-speech-api')
    const { voice } = await mountCall()
    const hearing = useHearingStore()
    voice.startCall()

    hearing.activeTranscriptionProvider = ''

    await expect.poll(() => voice.callActive).toBe(false)
  })

  // A muted call must not send speech. Push to Talk begins a manual input, which the voice activity rule does not own.
  it('refuses a manual input while the call is muted', async () => {
    localStorage.setItem('settings/hearing/active-provider', 'browser-web-speech-api')
    const { voice } = await mountCall()
    voice.startCall()
    voice.setCallMuted(true)

    expect(voice.beginManual('alice')).toBeUndefined()
  })

  it('mutes the call on the host and unmutes it again', async () => {
    const { voice, call } = await mountCall()
    voice.startCall()

    call.toggleMuted()
    expect(voice.callMuted).toBe(true)
    expect(call.muted).toBe(true)

    call.toggleMuted()
    expect(voice.callMuted).toBe(false)
  })

  it('shows the capsule for the whole call, with the time', async () => {
    const { screen, voice } = await mountCall()
    await expect.element(screen.getByTestId('voice-call-capsule')).not.toBeInTheDocument()

    voice.startCall()

    await expect.element(screen.getByTestId('voice-call-capsule')).toBeVisible()
    await expect.element(screen.getByTestId('voice-call-capsule-duration')).toHaveTextContent('0:00')
  })

  it('hangs up only from the red button of the capsule, and clears the call time', async () => {
    const { screen, voice, call } = await mountCall()
    voice.startCall()

    // A stray tap on the capsule body keeps the call.
    await screen.getByTestId('voice-call-capsule-duration').click({ force: true })
    expect(voice.callActive).toBe(true)

    await screen.getByTestId('voice-call-capsule-hang-up').click()

    expect(voice.callActive).toBe(false)
    expect(call.startedAt).toBeUndefined()
    await expect.element(screen.getByTestId('voice-call-capsule')).not.toBeInTheDocument()
  })
})

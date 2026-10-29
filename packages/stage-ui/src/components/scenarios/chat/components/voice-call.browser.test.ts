import { createPinia, disposePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import VoiceCallCapsule from './voice-call-capsule.vue'
import VoiceCallPanel from './voice-call-panel.vue'

import { useHearingStore } from '../../../../stores/modules/hearing'
import { useSettingsAudioDevice } from '../../../../stores/settings/audio-device'
import { useVoiceStore } from '../../../../stores/voice'
import { useVoiceCallStore } from '../../../../stores/voice-call'

import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'

const cleanups: (() => void)[] = []

afterEach(() => {
  cleanups.splice(0).reverse().forEach(cleanup => cleanup())
  localStorage.clear()
})

/**
 * Mounts the call panel and capsule the way the desktop composer does: the panel while expanded, the capsule always.
 * A `persistent` capsule is the whole call UI, like on a touch layout.
 */
async function mountCall(options: { persistent?: boolean } = {}) {
  const pinia = createPinia()
  cleanups.push(() => disposePinia(pinia))
  const component = defineComponent({ setup() {
    const call = useVoiceCallStore()
    return () => [
      !options.persistent && call.active && !call.minimized ? h(VoiceCallPanel) : null,
      h(VoiceCallCapsule, { persistent: options.persistent }),
    ]
  } })
  const screen = await render(component, {
    global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false })] },
  })
  cleanups.push(() => screen.unmount())
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
    const { screen, voice } = await mountCall()
    voice.startCall()

    const mute = screen.getByTestId('voice-call-mute')
    await expect.element(mute).toHaveAttribute('aria-pressed', 'false')
    await mute.click()

    expect(voice.callMuted).toBe(true)
    await expect.element(mute).toHaveAttribute('aria-pressed', 'true')
    await expect.element(screen.getByTestId('voice-call-status')).toHaveTextContent('stage.chat.call.muted')
    await mute.click()
    expect(voice.callMuted).toBe(false)
  })

  it('minimizes to the capsule, and a tap on the capsule body returns to the call', async () => {
    const { screen, voice } = await mountCall()
    voice.startCall()

    await screen.getByTestId('voice-call-minimize').click()
    await expect.element(screen.getByTestId('voice-call-panel')).not.toBeInTheDocument()
    await expect.element(screen.getByTestId('voice-call-capsule')).toBeVisible()

    await screen.getByTestId('voice-call-capsule-expand').click()

    expect(voice.callActive).toBe(true)
    await expect.element(screen.getByTestId('voice-call-panel')).toBeVisible()
    await expect.element(screen.getByTestId('voice-call-capsule')).not.toBeInTheDocument()
  })

  it('hangs up only from the red button of the capsule', async () => {
    const { screen, voice, call } = await mountCall()
    voice.startCall()
    call.minimize()

    await screen.getByTestId('voice-call-capsule-hang-up').click()

    expect(voice.callActive).toBe(false)
    await expect.element(screen.getByTestId('voice-call-capsule')).not.toBeInTheDocument()
    expect(call.minimized).toBe(false)
  })

  it('hangs up from the panel and clears the call time', async () => {
    const { screen, voice, call } = await mountCall()
    voice.startCall()

    await screen.getByTestId('voice-call-hang-up').click()

    expect(voice.callActive).toBe(false)
    expect(call.startedAt).toBeUndefined()
    await expect.element(screen.getByTestId('voice-call-panel')).not.toBeInTheDocument()
  })

  it('shows a persistent capsule for the whole call, with the time and no way to expand', async () => {
    const { screen, voice } = await mountCall({ persistent: true })
    voice.startCall()

    await expect.element(screen.getByTestId('voice-call-capsule')).toBeVisible()
    await expect.element(screen.getByTestId('voice-call-capsule-duration')).toHaveTextContent('0:00')
    expect(screen.getByTestId('voice-call-capsule-expand').query()).toBeNull()

    await screen.getByTestId('voice-call-capsule-hang-up').click()
    expect(voice.callActive).toBe(false)
  })
})

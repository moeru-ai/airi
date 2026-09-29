import en from '@proj-airi/i18n/locales/en'

import { createPinia, disposePinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useChatStore } from '../../../../stores/chat'
import { useChatSessionStore } from '../../../../stores/chat/session-store'
import { useHearingDraftStore } from '../../../../stores/hearing-drafts'
import { useHearingStore } from '../../../../stores/modules/hearing'
import { useSettingsAudioDevice } from '../../../../stores/settings/audio-device'
import { usePushToTalk } from './use-push-to-talk'

const audioContexts: AudioContext[] = []
const piniaContexts: ReturnType<typeof createPinia>[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await Promise.all(audioContexts.splice(0).map(context => context.close()))
  for (const pinia of piniaContexts.splice(0))
    disposePinia(pinia)
  localStorage.clear()
})

function mountInput(autoSend: boolean) {
  const context = new AudioContext()
  audioContexts.push(context)
  const destination = context.createMediaStreamDestination()
  const oscillator = context.createOscillator()
  oscillator.connect(destination)
  oscillator.start()
  vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(destination.stream)
  class Recognition {
    onresult?: (event: { resultIndex: number, results: { isFinal: boolean, 0: { transcript: string } }[] }) => void
    onend?: () => void
    start() {}
    stop() {
      this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'Captured phrase' } }] })
      this.onend?.()
    }

    abort() { this.onend?.() }
  }
  vi.stubGlobal('SpeechRecognition', Recognition)
  const pinia = createPinia()
  piniaContexts.push(pinia)
  let input!: ReturnType<typeof usePushToTalk>
  let sessions!: ReturnType<typeof useChatSessionStore>
  let drafts!: ReturnType<typeof useHearingDraftStore>
  const sends: Array<{ sessionId: string, at: number }> = []
  const screen = render(defineComponent({
    setup() {
      sessions = useChatSessionStore()
      drafts = useHearingDraftStore()
      useSettingsAudioDevice().mode = 'push-to-talk'
      const hearing = useHearingStore()
      hearing.activeTranscriptionProvider = 'browser-web-speech-api'
      hearing.activeTranscriptionModel = 'web-speech-api'
      hearing.autoSendEnabled = autoSend
      hearing.autoSendDelay = 400
      useChatStore().$onAction(({ name, args }) => {
        if (name === 'send')
          sends.push({ sessionId: args[0].sessionId, at: performance.now() })
      })
      input = usePushToTalk({ sessionId: () => sessions.activeSessionId, onError: () => {} })
      return () => h('button', { onClick: async () => {
        await context.resume()
        await input.begin()
      } }, 'Talk')
    },
  }), { global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
  return { input, sessions, drafts, screen, sends, context, stream: destination.stream }
}

// https://github.com/moeru-ai/airi/pull/2708
// ROOT CAUSE: The delayed send returned after cancellation without preserving its completed transcript.
it.each(['session', 'mode'] as const)('preserves the captured transcript when %s changes during send delay (Issue #2708)', async (change) => {
  const { input, sessions, drafts, screen, context, sends } = mountInput(true)
  const sessionId = await sessions.createSession('ptt-character')
  await screen.getByRole('button', { name: 'Talk' }).click()
  await expect.poll(() => input.phase.value).toBe('recording')
  const startedAt = context.currentTime
  await expect.poll(() => context.currentTime - startedAt).toBeGreaterThan(0.25)
  const finishing = input.end()
  await new Promise(resolve => setTimeout(resolve, 100))
  if (change === 'session')
    await sessions.createSession('other-character')
  else
    useSettingsAudioDevice().mode = 'off'
  await finishing
  expect(sends).toHaveLength(0)
  expect(drafts.drafts[sessionId]).toBe('Captured phrase')
})

import en from '@proj-airi/i18n/locales/en'

import { createPinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, shallowRef } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import VoiceComposer from './voice-composer.vue'

import { useChatStore } from '../../../../stores/chat'
import { useChatSessionStore } from '../../../../stores/chat/session-store'
import { useHearingStore } from '../../../../stores/modules/hearing'

let context: AudioContext | undefined
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await context?.close()
  localStorage.removeItem('ui/chat/voice-mode')
})

it('keeps recording after pointerleave and finishes only on the owning pointerup', async () => {
  // ROOT CAUSE:
  // VueUse onLongPress calls onMouseUp for both pointerleave and pointerup.
  // The composer treated a boundary crossing during a hold as release.
  const stop = vi.fn()
  class Recognition {
    onend?: () => void
    onresult?: (event: { resultIndex: number, results: { isFinal: boolean, 0: { transcript: string } }[] }) => void
    start() {}
    stop() {
      stop()
      this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'held words' } }] })
      this.onend?.()
    }

    abort() { this.onend?.() }
  }
  vi.stubGlobal('SpeechRecognition', Recognition)
  context = new AudioContext()
  const oscillator = context.createOscillator()
  const destination = context.createMediaStreamDestination()
  oscillator.connect(destination)
  oscillator.start()
  vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(destination.stream)
  localStorage.setItem('ui/chat/voice-mode', 'transcription')
  const draft = shallowRef('')
  const voiceActive = shallowRef(false)
  const screen = render(defineComponent({
    setup() {
      const input = shallowRef<HTMLElement | null>(null)
      const hearing = useHearingStore()
      hearing.activeTranscriptionProvider = 'browser-web-speech-api'
      hearing.activeTranscriptionModel = 'web-speech-api'
      return () => h('div', [
        h('div', { ref: input }),
        h('button', 'Pointer parking'),
        !draft.value && h(VoiceComposer, { 'inputElement': input.value, 'sessionId': 'gesture-test', 'modelValue': draft.value, 'onUpdate:modelValue': value => draft.value = value, 'onRecordingChange': value => voiceActive.value = value }),
      ])
    },
  }), { global: { plugins: [createPinia(), createI18n({ legacy: false, locale: 'en', messages: { en } }), createRouter({ history: createMemoryHistory(), routes: [] })] } })
  const button = screen.getByTestId('voice-composer-button')
  await screen.getByRole('button', { name: 'Pointer parking' }).click()
  await context.resume()
  const element = button.element()
  element.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, isPrimary: true, button: 0, buttons: 1, clientX: 100, clientY: 100, bubbles: true }))
  await expect.poll(() => document.querySelector('[data-testid="voice-recording-bar"]')).not.toBeNull()
  await expect.poll(() => voiceActive.value).toBe(true)
  await expect.poll(() => getComputedStyle(element).pointerEvents).toBe('none')
  await new Promise(resolve => setTimeout(resolve, 350))
  element.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, isPrimary: true, buttons: 1, clientX: 94, clientY: 100, bubbles: true }))
  element.dispatchEvent(new PointerEvent('pointerleave', { pointerId: 1, isPrimary: true, buttons: 1, clientX: 94, clientY: 100 }))
  await new Promise(resolve => setTimeout(resolve, 100))
  expect(stop).not.toHaveBeenCalled()
  expect(draft.value).toBe('')
  window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2, buttons: 0 }))
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(stop).not.toHaveBeenCalled()
  element.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, isPrimary: true, button: 0, buttons: 0, bubbles: true }))
  await expect.poll(() => draft.value).toBe('held words')
  await expect.poll(() => voiceActive.value).toBe(false)
  expect(stop).toHaveBeenCalledOnce()
})

it('keeps a failed voice send for retry until the user turn is stored', async () => {
  class Recognition {
    onend?: () => void
    onresult?: (event: { resultIndex: number, results: { isFinal: boolean, 0: { transcript: string } }[] }) => void
    start() {}
    stop() {
      this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'saved words' } }] })
      this.onend?.()
    }

    abort() { this.onend?.() }
  }
  vi.stubGlobal('SpeechRecognition', Recognition)
  context = new AudioContext()
  const oscillator = context.createOscillator()
  const destination = context.createMediaStreamDestination()
  oscillator.connect(destination)
  oscillator.start()
  vi.spyOn(navigator.mediaDevices, 'getUserMedia').mockResolvedValue(destination.stream)
  localStorage.setItem('ui/chat/voice-mode', 'audio')
  let chat!: ReturnType<typeof useChatStore>
  let chatSession!: ReturnType<typeof useChatSessionStore>
  const sent = vi.fn()
  const showComposer = shallowRef(true)
  const screen = render(defineComponent({
    setup() {
      const input = shallowRef<HTMLElement | null>(null)
      const hearing = useHearingStore()
      hearing.activeTranscriptionProvider = 'browser-web-speech-api'
      hearing.activeTranscriptionModel = 'web-speech-api'
      chat = useChatStore()
      chatSession = useChatSessionStore()
      return () => h('div', [
        h('div', { ref: input }),
        h('button', 'Pointer parking'),
        h('button', { onClick: () => showComposer.value = !showComposer.value }, 'Toggle composer'),
        showComposer.value && h(VoiceComposer, { 'inputElement': input.value, 'sessionId': 'voice-send-test', 'replyToMessageId': 'reply-1', 'modelValue': '', 'onUpdate:modelValue': () => {}, 'onSent': sent }),
      ])
    },
  }), { global: { plugins: [createPinia(), createI18n({ legacy: false, locale: 'en', messages: { en } }), createRouter({ history: createMemoryHistory(), routes: [] })] } })
  const send = vi.spyOn(chat, 'send').mockRejectedValueOnce(new Error('Provider unavailable'))
  await screen.getByRole('button', { name: 'Pointer parking' }).click()
  await context.resume()
  const button = screen.getByTestId('voice-composer-button').element()
  button.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, isPrimary: true, button: 0, buttons: 1, clientX: 100, clientY: 100, bubbles: true }))
  await expect.poll(() => document.querySelector('[data-testid="voice-recording-bar"]')).not.toBeNull()
  await new Promise(resolve => setTimeout(resolve, 450))
  button.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, isPrimary: true, button: 0, buttons: 0, bubbles: true }))
  await expect.poll(() => send.mock.calls.length).toBe(1)
  await expect.poll(() => screen.getByTestId('voice-retry-send').element().hasAttribute('disabled')).toBe(false)
  expect(send.mock.calls[0][0].replyToMessageId).toBe('reply-1')
  expect(sent).not.toHaveBeenCalled()
  await screen.getByRole('button', { name: 'Toggle composer' }).click()
  await screen.getByRole('button', { name: 'Toggle composer' }).click()
  expect(screen.getByTestId('voice-retry-send').element()).toBeTruthy()

  send.mockImplementationOnce(async (payload) => {
    const audio = payload.attachments?.[0]
    if (!audio || audio.type !== 'audio')
      throw new Error('Expected audio attachment')
    chatSession.sessionMessages[payload.sessionId] = [{ role: 'user', content: [{ type: 'text', text: '' }, { type: 'input_audio', input_audio: { data: audio.data, format: 'wav' } }] }]
    return { sessionId: payload.sessionId, messages: chatSession.sessionMessages[payload.sessionId] }
  })
  await screen.getByTestId('voice-retry-send').click()
  await expect.poll(() => sent.mock.calls.length).toBe(1)
  expect(send.mock.calls[1][0].attachments).toEqual(send.mock.calls[0][0].attachments)
  expect(screen.getByTestId('voice-composer-button').element()).toBeTruthy()
})

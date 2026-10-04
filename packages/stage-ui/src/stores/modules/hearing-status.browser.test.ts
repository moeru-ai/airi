import en from '@proj-airi/i18n/locales/en'

import { createPinia } from 'pinia'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useProviderConfigStore } from '../providers/config'
import { useHearingSpeechInputPipeline, useHearingStore } from './hearing'

const provider = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock('@xsai/generate-transcription', () => ({ generateTranscription: provider.generate }))

afterEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

it('shows pending recording work, retains recognized text, and clears busy after failure', async () => {
  // ROOT CAUSE:
  // Recording requests exposed only an error ref, so compact layouts could
  // not distinguish a pending transcription from a quiet microphone.
  let session!: ReturnType<typeof useHearingSpeechInputPipeline>
  let finish!: (value: { text: string }) => void
  provider.generate.mockImplementationOnce(() => new Promise(resolve => finish = resolve))
  render(defineComponent({
    setup() {
      const config = useProviderConfigStore()
      config.ensureProvider('openai-compatible-audio-transcription', 'openai-compatible-audio-transcription', { apiKey: 'test', baseUrl: 'https://transcription.invalid/v1/' })
      const hearing = useHearingStore()
      hearing.activeTranscriptionProvider = 'openai-compatible-audio-transcription'
      hearing.activeTranscriptionModel = 'test-model'
      session = useHearingSpeechInputPipeline()
      return () => h('div')
    },
  }), { global: { plugins: [createPinia(), createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
  const pending = session.transcribeForRecording(new Blob(['audio'], { type: 'audio/wav' }))
  expect(session.isTranscribing).toBe(true)
  await expect.poll(() => provider.generate.mock.calls.length).toBe(1)
  finish({ text: 'recognized words' })
  await expect(pending).resolves.toBe('recognized words')
  expect(session.transcript).toBe('recognized words')
  expect(session.isTranscribing).toBe(false)

  provider.generate.mockRejectedValueOnce(new Error('Provider timed out'))
  await session.transcribeForRecording(new Blob(['audio'], { type: 'audio/wav' }))
  expect(session.isTranscribing).toBe(false)
  expect(session.error).toContain('Provider timed out')
  expect(session.transcript).toBe('recognized words')
})

it('waits after browser speech ends and clears waiting when the final transcript arrives', async () => {
  const recognitions: Recognition[] = []
  class Recognition {
    onend?: () => void
    onspeechstart?: () => void
    onspeechend?: () => void
    onresult?: (event: { resultIndex: number, results: { isFinal: boolean, 0: { transcript: string } }[] }) => void
    constructor() { recognitions.push(this) }
    start() {}
    stop() { this.onend?.() }
    abort() { this.onend?.() }
  }
  vi.stubGlobal('SpeechRecognition', Recognition)
  let session!: ReturnType<typeof useHearingSpeechInputPipeline>
  render(defineComponent({
    setup() {
      const hearing = useHearingStore()
      hearing.activeTranscriptionProvider = 'browser-web-speech-api'
      hearing.activeTranscriptionModel = 'web-speech-api'
      session = useHearingSpeechInputPipeline()
      return () => h('div')
    },
  }), { global: { plugins: [createPinia(), createI18n({ legacy: false, locale: 'en', messages: { en } })] } })
  try {
    await session.transcribeForMediaStream(new MediaStream(), { consumerId: 'status-test' })
    const recognition = recognitions[0]!
    recognition.onspeechstart?.()
    expect(session.isTranscribing).toBe(false)
    recognition.onspeechend?.()
    expect(session.isTranscribing).toBe(true)
    recognition.onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: 'final words' } }] })
    expect(session.isTranscribing).toBe(false)
    expect(session.transcript).toBe('final words')
    // A browser may deliver the final result before its speech-end event.
    recognition.onspeechend?.()
    expect(session.isTranscribing).toBe(false)
    recognition.onspeechstart?.()
    recognition.onspeechend?.()
    recognition.onend?.()
    expect(session.isTranscribing).toBe(false)
    expect(session.error).toContain('No transcription result')
  }
  finally {
    await session.stopStreamingTranscription(true)
    vi.unstubAllGlobals()
  }
})

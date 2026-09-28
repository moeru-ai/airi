import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useSpeechRuntimeStore } from '@proj-airi/stage-ui/stores/speech-runtime'
import { createPinia, disposePinia } from 'pinia'
import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

// https://github.com/moeru-ai/airi/pull/2672#discussion_r4115859403
// ROOT CAUSE: Context-free speech resolved the current character for each
// segment. One intent must retain its selection until it ends or is canceled.
it('keeps the host speech selection across segments and refreshes it for the next intent', async () => {
  localStorage.clear()
  const requests: Array<{ model: string, voice: string }> = []
  const originalFetch = globalThis.fetch
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    if (String(input).startsWith('https://speech.invalid/')) {
      if (String(input).endsWith('/audio/speech')) {
        requests.push(JSON.parse(String(init?.body)))
        return new Response(new ArrayBuffer(0), { headers: { 'Content-Type': 'audio/wav' } })
      }
      return Response.json({ data: [], voices: [] })
    }
    return originalFetch(input, init)
  }))
  const pinia = createPinia()
  const stage = render(WidgetStage, {
    props: { paused: true },
    global: { plugins: [pinia, PiniaColada, createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  const runtime = useSpeechRuntimeStore(pinia)
  try {
    await expect.poll(() => runtime.isHost()).toBe(true)
    const cards = useAiriCardStore(pinia)
    await cards.initialize()
    await useProviderConfigStore(pinia).ensureProvider('openai-compatible-audio-speech', 'openai-compatible-audio-speech', { apiKey: 'fixture', baseUrl: 'https://speech.invalid/v1/' })
    await cards.updateActiveCardSpeech({ provider: 'openai-compatible-audio-speech', model: 'model-a', voice_id: 'voice-a' })
    const intent = runtime.openIntent({ intentId: 'first-intent' })
    intent.writeLiteral('This is the first complete sentence for the speech pipeline. ')
    intent.writeFlush()
    await expect.poll(() => requests.length).toBe(1)
    await cards.updateActiveCardSpeech({ provider: 'openai-compatible-audio-speech', model: 'model-b', voice_id: 'voice-b' })
    intent.writeLiteral('This is the second complete sentence for the speech pipeline. ')
    intent.writeFlush()
    await expect.poll(() => requests.length).toBe(2)
    expect(requests.map(({ model, voice }) => ({ model, voice }))).toEqual([
      { model: 'model-a', voice: 'voice-a' },
      { model: 'model-a', voice: 'voice-a' },
    ])
    intent.cancel('fixture-cancel')
    const next = runtime.openIntent({ intentId: 'next-intent' })
    next.writeLiteral('Next intent.')
    next.end()
    await expect.poll(() => requests.length).toBe(3)
    expect(requests[2]).toMatchObject({ model: 'model-b', voice: 'voice-b' })
  }
  finally {
    stage.unmount()
    await runtime.dispose()
    disposePinia(pinia)
    vi.unstubAllGlobals()
    localStorage.clear()
  }
})

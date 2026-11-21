import type { TranscriptionEvent } from '@proj-airi/core-agent'
import type { PcmBlock } from '@proj-airi/pipelines-audio'

import en from '@proj-airi/i18n/locales/en'

import { PiniaColada } from '@pinia/colada'
import { MIMO_ASR_MODEL } from '@proj-airi/provider-inference'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from 'vue'
import { createI18n } from 'vue-i18n'

import { trackPendingActions } from '../../libs/pinia/pending-actions'
import { useProviderConfigStore } from '../providers/config'
import { useHearingStore } from './hearing'

interface MimoRequest {
  model: string
  asr_options: { language: string }
  messages: Array<{ content: Array<{ input_audio: { data: string, format: string } }> }>
}

const nativeFetch = globalThis.fetch
const contexts: Array<{ close: () => void, pending: () => number }> = []
const requests: Array<{ body: MimoRequest, signal?: AbortSignal | null }> = []
let holdRequest = false

beforeEach(() => {
  localStorage.clear()
  requests.length = 0
  holdRequest = false
  vi.stubGlobal('fetch', vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input, location.origin)
    if (url.protocol === 'data:' || url.origin === location.origin)
      return nativeFetch(input, init)
    if (url.origin === 'https://example.com' && url.pathname === '/v1/chat/completions') {
      requests.push({ body: JSON.parse(String(init?.body)), signal: init?.signal })
      if (holdRequest && init?.signal) {
        const signal = init.signal
        return new Promise<Response>((_resolve, reject) => {
          const abort = () => reject(signal.reason)
          if (signal.aborted)
            abort()
          else
            signal.addEventListener('abort', abort, { once: true })
        })
      }
      return Response.json({ model: MIMO_ASR_MODEL, choices: [{ message: { content: 'Recognized words' } }] })
    }
    return Response.json({ voices: [], models: [], data: [] })
  }))
})

afterEach(async () => {
  await expect.poll(() => contexts.map(context => context.pending())).toEqual(contexts.map(() => 0))
  contexts.splice(0).forEach(context => context.close())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})

/** Creates real Hearing and provider owners. Only outbound network requests cross the fixture boundary. */
async function createContext(language?: string) {
  const pinia = createPinia()
  const pending = trackPendingActions(pinia)
  let hearing: ReturnType<typeof useHearingStore> | undefined
  const app = createApp({
    setup() {
      hearing = useHearingStore(pinia)
      return () => null
    },
  })
    .use(pinia)
    .use(PiniaColada)
    .use(createI18n({ legacy: false, locale: 'en', messages: { en } }))
  app.mount(document.createElement('div'))
  contexts.push({
    close: () => {
      app.unmount()
      disposePinia(pinia)
    },
    pending,
  })
  if (!hearing)
    throw new Error('Hearing did not initialize')
  const config = useProviderConfigStore(pinia)
  await config.ensureProvider('mimo-audio-transcription', 'mimo-audio-transcription', {
    apiKey: 'test-key',
    baseUrl: 'https://example.com/v1/',
    model: MIMO_ASR_MODEL,
    ...(language ? { language } : {}),
  })
  hearing.enabled = true
  hearing.activeTranscriptionProvider = 'mimo-audio-transcription'
  hearing.activeTranscriptionModel = MIMO_ASR_MODEL
  return { hearing, config }
}

function recording() {
  return new ReadableStream<PcmBlock>({
    start(controller) {
      controller.enqueue({ range: { sourceId: 'recording', startFrame: 0, endFrame: 160 }, sampleRate: 16_000, channels: [new Float32Array(160)] })
      controller.close()
    },
  })
}

describe('hearing MiMo request ownership', () => {
  // https://github.com/moeru-ai/airi/pull/2410
  // ROOT CAUSE: Generic locale hints bypassed MiMo automatic language detection after the Hearing pipeline moved.
  it.each([undefined, 'zh', 'en'])('captures MiMo language %s and sends the current PCM-to-WAV path', async (language) => {
    const { hearing, config } = await createContext(language)
    const transcriber = hearing.createTranscriber()
    await config.patchProviderConfig('mimo-audio-transcription', { language: 'auto' })
    const events: TranscriptionEvent[] = []
    for await (const event of transcriber.transcribe({ audio: recording(), signal: new AbortController().signal }))
      events.push(event)

    expect(requests).toHaveLength(1)
    const request = requests[0].body
    expect(request.model).toBe(MIMO_ASR_MODEL)
    expect(request.asr_options.language).toBe(language ?? 'auto')
    const audio = request.messages[0].content[0].input_audio
    expect(audio.format).toBe('wav')
    const bytes = Uint8Array.from(atob(audio.data.split(',')[1]), value => value.charCodeAt(0))
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF')
    expect(new DataView(bytes.buffer).getUint32(24, true)).toBe(16_000)
    expect(events.some(event => event.type === 'update' && event.segments.some(segment => segment.text === 'Recognized words'))).toBe(true)
  })

  it('aborts the real provider HTTP request when the captured recognition is cancelled', async () => {
    holdRequest = true
    const { hearing } = await createContext()
    const transcriber = hearing.createTranscriber()
    const abort = new AbortController()
    const reader = transcriber.transcribe({ audio: recording(), signal: abort.signal }).getReader()
    const result = reader.read().catch(error => error)
    await expect.poll(() => requests.length).toBe(1)

    abort.abort(new DOMException('Cancelled', 'AbortError'))

    expect(requests[0].signal?.aborted).toBe(true)
    expect(await result).toMatchObject({ name: 'AbortError' })
  })
})

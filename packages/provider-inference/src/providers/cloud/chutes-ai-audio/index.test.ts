import type { SpeechProvider, TranscriptionProvider } from '@xsai-ext/providers/utils'

import type { ProviderInstance } from '../../../types'

import { generateSpeech } from '@xsai/generate-speech'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerChutesAISpeech, providerChutesAITranscription } from './index'

function isSpeechProvider(provider: ProviderInstance): provider is SpeechProvider {
  return 'speech' in provider && typeof provider.speech === 'function'
}

function isTranscriptionProvider(provider: ProviderInstance): provider is TranscriptionProvider {
  return 'transcription' in provider && typeof provider.transcription === 'function'
}

async function createSpeechProvider(voiceSettings?: Record<string, unknown>) {
  const provider = await providerChutesAISpeech.createProvider({ apiKey: 'cpk_test', voiceSettings })
  if (!isSpeechProvider(provider))
    throw new Error('Chutes speech provider must support speech')

  return provider
}

async function createTranscriptionProvider() {
  const provider = await providerChutesAITranscription.createProvider({ apiKey: 'cpk_test' })
  if (!isTranscriptionProvider(provider))
    throw new Error('Chutes transcription provider must support transcription')

  return provider
}

/** Builds the multipart body that `generateTranscription` from `@xsai/generate-transcription` sends. */
function transcriptionForm(model: string, audio: Uint8Array<ArrayBuffer>, language?: string) {
  const body = new FormData()
  body.append('model', model)
  body.append('file', new Blob([audio], { type: 'audio/wav' }), 'speech.wav')
  body.append('response_format', 'json')
  if (language)
    body.append('language', language)
  return body
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('providerChutesAISpeech', () => {
  it('sends Kokoro requests to the AudioDojo route with the saved speed', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(new Uint8Array([82, 73, 70, 70]), { headers: { 'Content-Type': 'audio/wav' } }))
    vi.stubGlobal('fetch', fetch)
    const provider = await createSpeechProvider({ speed: 1.25 })

    const audio = await generateSpeech({ ...provider.speech('kokoro'), input: 'Hello', voice: 'bf_emma' })

    const [url, init] = fetch.mock.calls[0]
    expect(String(url)).toBe('https://vonkaiser-audiodojo.chutes.ai/tts/kokoro')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer cpk_test')
    expect(JSON.parse(String(init?.body))).toEqual({ text: 'Hello', voice: 'bf_emma', speed: 1.25 })
    expect(new Uint8Array(audio)).toEqual(new Uint8Array([82, 73, 70, 70]))
  })

  it('sends Qwen3-TTS speaker, language, and style instruction', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(new Uint8Array([0])))
    vi.stubGlobal('fetch', fetch)
    const provider = await createSpeechProvider({ language: 'Japanese', instruct: 'Speak softly.' })

    await generateSpeech({ ...provider.speech('qwen3-tts'), input: 'こんにちは', voice: 'Ono Anna' })

    const [url, init] = fetch.mock.calls[0]
    expect(String(url)).toBe('https://vonkaiser-audiodojo.chutes.ai/tts/qwen3custom')
    expect(JSON.parse(String(init?.body))).toEqual({ text: 'こんにちは', speaker: 'Ono Anna', language: 'Japanese', instruct: 'Speak softly.' })
  })

  it('surfaces AudioDojo errors through generateSpeech', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>(async () => new Response('Authentication required.', { status: 401 })))
    const provider = await createSpeechProvider()

    await expect(generateSpeech({ ...provider.speech('kokoro'), input: 'Hello', voice: 'af_heart' }))
      .rejects
      .toThrow('Remote sent 401 response: Authentication required.')
  })

  it('lists voices for each model through compatibleModels', async () => {
    const provider = await createSpeechProvider()

    const voices = await providerChutesAISpeech.extraMethods!.listVoices!({ apiKey: 'cpk_test' }, provider)

    expect(voices.filter(voice => voice.compatibleModels?.includes('kokoro'))).toHaveLength(54)
    expect(voices.filter(voice => voice.compatibleModels?.includes('qwen3-tts'))).toHaveLength(9)
    expect(voices.find(voice => voice.id === 'jf_alpha')).toMatchObject({ name: 'Alpha', gender: 'female', languages: [{ code: 'ja', title: 'Japanese' }] })
  })
})

describe('providerChutesAITranscription', () => {
  it('sends base64 audio and the requested language to the Whisper route', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ text: ' Hello there. ', chunks: [] }))
    vi.stubGlobal('fetch', fetch)
    const provider = await createTranscriptionProvider()
    const request = provider.transcription('whisper-large-v3-turbo')

    const response = await request.fetch!(new URL('https://vonkaiser-audiodojo.chutes.ai/audio/transcriptions'), {
      method: 'POST',
      headers: { Authorization: 'Bearer cpk_test' },
      body: transcriptionForm('whisper-large-v3-turbo', new Uint8Array([1, 2, 3]), 'en'),
    })

    const [url, init] = fetch.mock.calls[0]
    expect(String(url)).toBe('https://vonkaiser-audiodojo.chutes.ai/stt/whisper')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer cpk_test')
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(String(init?.body))).toEqual({ audio_b64: 'AQID', return_timestamps: false, language: 'en' })
    expect(await response.json()).toEqual({ text: 'Hello there.' })
  })

  it('joins segment arrays from the removed Whisper chute contract', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>(async () => Response.json([{ start: 0, end: 1, text: 'Hello' }, { start: 1, end: 2, text: ' there.' }])))
    const provider = await createTranscriptionProvider()
    const request = provider.transcription('parakeet-tdt-0.6b-v3')

    const response = await request.fetch!(new URL('https://vonkaiser-audiodojo.chutes.ai/audio/transcriptions'), {
      method: 'POST',
      body: transcriptionForm('parakeet-tdt-0.6b-v3', new Uint8Array([1])),
    })

    expect(await response.json()).toEqual({ text: 'Hello there.' })
  })

  it('reports the received keys when a response has no transcript text', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>(async () => Response.json({ result: 'Hello' })))
    const provider = await createTranscriptionProvider()
    const request = provider.transcription('canary-qwen-2.5b')

    await expect(request.fetch!(new URL('https://vonkaiser-audiodojo.chutes.ai/audio/transcriptions'), {
      method: 'POST',
      body: transcriptionForm('canary-qwen-2.5b', new Uint8Array([1])),
    })).rejects.toThrow('Chutes transcription response has no transcript text (received: result).')
  })
})

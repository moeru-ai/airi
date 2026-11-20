import type { ProviderInstance } from '../../../types'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerMinimaxTranscription } from './index'

const config = { apiKey: 'sk-test', baseUrl: 'https://api.minimax.io/v1/', language: '' }

function readProvider() {
  return providerMinimaxTranscription.createProvider(config) as ProviderInstance & {
    transcription: (model: string) => {
      model: string
      fetch?: typeof globalThis.fetch
    }
  }
}

function lastCall(mock: { mock: { calls: unknown[][] } }) {
  const [url, init] = mock.mock.calls.at(-1) as [string, RequestInit]
  return { url, body: init.body as FormData, init }
}

describe('providerMinimaxTranscription', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ROOT CAUSE:
  //
  // The shared transcription helper posts to the OpenAI route
  // `audio/transcriptions` and sends the language as a form field. MiniMax
  // exposes `POST /v1/speech_to_text` and reads the language from a header, so
  // an unadapted request either hits a missing route or loses the hint.
  it('rewrites the request to the MiniMax speech-to-text route', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(
      JSON.stringify({ text: 'hola', duration: 1.2 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    vi.stubGlobal('fetch', fetchMock)

    const request = readProvider().transcription('asr-1.0')
    const source = new FormData()
    source.append('model', 'asr-1.0')
    source.append('file', new Blob(['x']), 'a.wav')
    await request.fetch!('https://api.minimax.io/v1/audio/transcriptions', { method: 'POST', body: source })

    const { url, body } = lastCall(fetchMock as never)
    expect(url).toBe('https://api.minimax.io/v1/speech_to_text')
    expect(body.get('model')).toBe('asr-1.0')
    expect(body.get('file')).toBeTruthy()
  })

  it('drops the OpenAI-only timestamp granularity field', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const request = readProvider().transcription('asr-1.0')
    const source = new FormData()
    source.append('model', 'asr-1.0')
    source.append('file', new Blob(['x']), 'a.wav')
    source.append('response_format', 'verbose_json')
    source.append('timestamp_granularities[]', 'segment')
    await request.fetch!('https://api.minimax.io/v1/audio/transcriptions', { method: 'POST', body: source })

    const { body } = lastCall(fetchMock as never)
    expect(body.get('response_format')).toBe('verbose_json')
    expect(body.get('timestamp_granularities[]')).toBeNull()
  })

  it('sends the configured language as a request header', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const provider = providerMinimaxTranscription.createProvider({ ...config, language: 'es' }) as {
      transcription: (model: string) => { fetch?: typeof globalThis.fetch }
    }
    const request = provider.transcription('asr-1.0')
    const source = new FormData()
    source.append('file', new Blob(['x']), 'a.wav')
    await request.fetch!('https://api.minimax.io/v1/audio/transcriptions', { method: 'POST', body: source })

    const { init } = lastCall(fetchMock as never)
    const headers = init.headers as Headers
    expect(headers.get('language')).toBe('es')
  })

  it('omits the language header so the API detects it', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const request = readProvider().transcription('asr-1.0')
    const source = new FormData()
    source.append('file', new Blob(['x']), 'a.wav')
    await request.fetch!('https://api.minimax.io/v1/audio/transcriptions', { method: 'POST', body: source })

    const { init } = lastCall(fetchMock as never)
    expect((init.headers as Headers).get('language')).toBeNull()
  })

  // ROOT CAUSE:
  //
  // A `Request` built from a FormData body carries a `Content-Type` bound to
  // that body's multipart boundary. Forwarding it with a rebuilt body broke
  // parsing, and the API answered `400 Error when parsing request`.
  it('lets fetch rebuild the multipart boundary instead of forwarding the old one', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const request = readProvider().transcription('asr-1.0')
    const source = new FormData()
    source.append('model', 'asr-1.0')
    source.append('file', new Blob(['x']), 'a.wav')
    await request.fetch!('https://api.minimax.io/v1/audio/transcriptions', {
      method: 'POST',
      body: source,
      headers: { Authorization: 'Bearer sk-test' },
    })

    const { init } = lastCall(fetchMock as never)
    const headers = init.headers as Headers
    // An explicit Content-Type would pin the stale boundary and break parsing.
    expect(headers.get('content-type')).toBeNull()
    expect(headers.get('authorization')).toBe('Bearer sk-test')
  })

  it('offers the documented ASR model', async () => {
    const models = await providerMinimaxTranscription.extraMethods!.listModels!(config, readProvider())
    expect(models.map(model => model.id)).toEqual(['asr-1.0'])
  })
})

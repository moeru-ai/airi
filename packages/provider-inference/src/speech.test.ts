import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerOpenRouterAudioSpeech } from './providers/cloud/openrouter-audio-speech'
import { executeSpeech, SpeechUpstreamError } from './speech'

function sseAudioChunks(...base64Chunks: string[]) {
  const events = base64Chunks.map(data => `data: ${JSON.stringify({ choices: [{ delta: { audio: { data } } }] })}\n`)
  return new Response([...events, 'data: [DONE]\n'].join('\n'), { headers: { 'Content-Type': 'text/event-stream' } })
}

describe('executeSpeech', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the bytes and the content type of an OpenAI-shaped provider', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const fetchSpeech = vi.fn(async (_url: URL, _init: RequestInit) => new Response(bytes, { headers: { 'Content-Type': 'audio/mpeg' } }))

    const result = await executeSpeech(
      { speech: (model: string) => ({ baseURL: 'https://tts.example/v1/', model, fetch: fetchSpeech }) },
      { model: 'tts-1', text: 'hello', voice: 'alloy', speed: 1.2 },
    )

    expect(result.contentType).toBe('audio/mpeg')
    expect(new Uint8Array(result.body)).toEqual(bytes)
    expect(String(fetchSpeech.mock.calls[0][0])).toBe('https://tts.example/v1/audio/speech')
    expect(JSON.parse(String(fetchSpeech.mock.calls[0][1].body))).toMatchObject({ model: 'tts-1', input: 'hello', voice: 'alloy', speed: 1.2 })
  })

  it('runs the OpenRouter definition in Node.js and returns WAV audio', async () => {
    // The provider joins the chunks before it decodes them, so each chunk must be unpadded base64.
    const fetchOpenRouter = vi.fn(async (_url: URL | string, _init?: RequestInit) => sseAudioChunks('AAEC', 'AwQF'))
    vi.stubGlobal('fetch', fetchOpenRouter)

    const provider = await providerOpenRouterAudioSpeech.createProvider({ apiKey: 'sk-test' })
    const result = await executeSpeech(provider, { model: 'openai/gpt-audio-mini', text: 'hello', voice: 'alloy' })

    expect(result.contentType).toBe('audio/wav')
    expect(new TextDecoder().decode(result.body.slice(0, 4))).toBe('RIFF')
    expect(String(fetchOpenRouter.mock.calls[0][0])).toBe('https://openrouter.ai/api/v1/chat/completions')
  })

  it('reports a non-2xx provider response with its status, headers, and body', async () => {
    const fetchSpeech = vi.fn(async (_url: URL, _init: RequestInit) => new Response('slow down', { status: 429, headers: { 'Retry-After': '3' } }))

    const error = await executeSpeech(
      { speech: (model: string) => ({ baseURL: 'https://tts.example/v1/', model, fetch: fetchSpeech }) },
      { model: 'tts-1', text: 'hello', voice: 'alloy' },
    ).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(SpeechUpstreamError)
    expect(error).toMatchObject({ status: 429, body: 'slow down' })
    expect((error as SpeechUpstreamError).headers.get('retry-after')).toBe('3')
  })

  it('stops when the caller aborts', async () => {
    const controller = new AbortController()
    const fetchSpeech = vi.fn(async (_url: URL, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal)
      throw init.signal?.reason
    })
    controller.abort(new Error('caller-aborted'))

    await expect(executeSpeech(
      { speech: (model: string) => ({ baseURL: 'https://tts.example/v1/', model, fetch: fetchSpeech }) },
      { model: 'tts-1', text: 'hello', voice: 'alloy', abortSignal: controller.signal },
    )).rejects.toThrow('caller-aborted')
  })

  it('rejects an instance that has no speech capability', async () => {
    await expect(executeSpeech(
      { model: () => ({ baseURL: 'https://x.example/v1/' }) },
      { model: 'm', text: 't', voice: 'v' },
    )).rejects.toThrow('does not support speech synthesis')
  })
})

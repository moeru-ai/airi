import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import type { ModelInfo, VoiceInfo } from '../providers'

import { describe, expect, it, vi } from 'vitest'

import { buildMiniMaxSpeechProvider } from './minimax-speech'

async function getSpeechProvider(config: Record<string, unknown>): Promise<SpeechProviderWithExtraOptions<string, Record<string, unknown>>> {
  const metadata = buildMiniMaxSpeechProvider()
  return (await metadata.createProvider(config)) as SpeechProviderWithExtraOptions<string, Record<string, unknown>>
}

/** Builds a mocked t2a_v2 SSE Response streaming a single hex audio chunk plus a final summary. */
function mockSseResponse(events: unknown[]): Response {
  const body = events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

describe('minimaxSpeech provider metadata', () => {
  const metadata = buildMiniMaxSpeechProvider()

  it('has the correct provider ID', () => {
    expect(metadata.id).toBe('minimax-speech')
  })

  it('is in the speech category with a text-to-speech task', () => {
    expect(metadata.category).toBe('speech')
    expect(metadata.tasks).toContain('text-to-speech')
  })

  it('defaults baseUrl to the global endpoint', () => {
    const defaults = metadata.defaultOptions?.()
    expect(defaults?.baseUrl).toBe('https://api.minimax.io')
  })
})

describe('minimaxSpeech listModels', () => {
  const metadata = buildMiniMaxSpeechProvider()

  it('returns the full current speech catalog', async () => {
    const models = await metadata.capabilities.listModels?.({})
    expect(models?.map((m: ModelInfo) => m.id)).toEqual([
      'speech-2.8-hd',
      'speech-2.8-turbo',
      'speech-2.6-hd',
      'speech-2.6-turbo',
      'speech-02-hd',
      'speech-02-turbo',
      'speech-01-hd',
      'speech-01-turbo',
    ])
  })

  it('formats display names from ids', async () => {
    const models = await metadata.capabilities.listModels?.({})
    const byId = new Map(models?.map((m: ModelInfo) => [m.id, m.name]))
    expect(byId.get('speech-2.8-hd')).toBe('Speech 2.8 HD')
    expect(byId.get('speech-02-turbo')).toBe('Speech 02 Turbo')
  })

  it('tags every model with the provider id', async () => {
    const models = await metadata.capabilities.listModels?.({})
    for (const model of models ?? [])
      expect(model.provider).toBe('minimax-speech')
  })
})

describe('minimaxSpeech listVoices', () => {
  const metadata = buildMiniMaxSpeechProvider()

  it('returns the bundled voices', async () => {
    const voices = await metadata.capabilities.listVoices?.({})
    expect(voices?.map((v: VoiceInfo) => v.id)).toContain('English_Graceful_Lady')
    expect(voices).toHaveLength(10)
  })
})

describe('minimaxSpeech validation', () => {
  const metadata = buildMiniMaxSpeechProvider()

  it('fails validation without API key', async () => {
    const result = await metadata.validators.validateProviderConfig({})
    expect(result.valid).toBe(false)
  })

  it('passes validation with an API key', async () => {
    const result = await metadata.validators.validateProviderConfig({ apiKey: 'test-key' })
    expect(result.valid).toBe(true)
  })
})

describe('minimaxSpeech request construction', () => {
  it('uses the default model and versioned base URL', async () => {
    const provider = await getSpeechProvider({ apiKey: 'test-key' })
    const speechResult = provider.speech('' as any)
    expect(speechResult.model).toBe('speech-2.8-hd')
    expect(speechResult.baseURL).toBe('https://api.minimax.io/v1/')
  })

  it('targets the CN endpoint when baseUrl points at minimaxi.com', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockSseResponse([
      { data: { audio: '0102', status: 1 }, base_resp: { status_code: 0 } },
    ]))

    const provider = await getSpeechProvider({ apiKey: 'test-key', baseUrl: 'https://api.minimaxi.com/' })
    const fetchFn = provider.speech('speech-2.8-hd').fetch!
    await fetchFn(new URL('http://test'), {
      body: JSON.stringify({ model: 'speech-2.8-hd', input: 'hi', voice: 'English_Graceful_Lady' }),
    })

    expect((globalThis.fetch as any).mock.calls[0][0]).toBe('https://api.minimaxi.com/v1/t2a_v2')
  })

  it('throws when input text is missing', async () => {
    const provider = await getSpeechProvider({ apiKey: 'test-key' })
    const fetchFn = provider.speech('speech-2.8-hd').fetch!
    await expect(fetchFn(new URL('http://test'), {
      body: JSON.stringify({ model: 'speech-2.8-hd' }),
    })).rejects.toThrow('Missing input text')
  })

  it('forwards configurable request fields and output format', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockSseResponse([
      { data: { audio: '0102', status: 1 }, base_resp: { status_code: 0 } },
    ]))

    const provider = await getSpeechProvider({ apiKey: 'test-key' })
    const fetchFn = provider.speech('speech-2.8-hd').fetch!
    const response = await fetchFn(new URL('http://test'), {
      body: JSON.stringify({
        model: 'speech-2.8-hd',
        input: 'hello',
        voice: 'Mandarin_Sweet_Girl',
        speed: 1.2,
        vol: 0.8,
        pitch: 3,
        language_boost: 'English',
        subtitle_enable: true,
        format: 'wav',
        sample_rate: 24000,
      }),
    })

    const requestBody = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
    expect(requestBody.voice_setting).toEqual({ voice_id: 'Mandarin_Sweet_Girl', speed: 1.2, vol: 0.8, pitch: 3 })
    expect(requestBody.audio_setting.format).toBe('wav')
    expect(requestBody.audio_setting.sample_rate).toBe(24000)
    expect(requestBody.language_boost).toBe('English')
    expect(requestBody.subtitle_enable).toBe(true)
    expect(response.headers.get('Content-Type')).toBe('audio/wav')
  })

  it('omits optional fields when not provided', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockSseResponse([
      { data: { audio: '0102', status: 1 }, base_resp: { status_code: 0 } },
    ]))

    const provider = await getSpeechProvider({ apiKey: 'test-key' })
    const fetchFn = provider.speech('speech-2.8-hd').fetch!
    await fetchFn(new URL('http://test'), {
      body: JSON.stringify({ model: 'speech-2.8-hd', input: 'hello', voice: 'English_Graceful_Lady' }),
    })

    const requestBody = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body)
    expect(requestBody).not.toHaveProperty('language_boost')
    expect(requestBody).not.toHaveProperty('subtitle_enable')
    expect(requestBody.audio_setting.format).toBe('mp3')
  })

  it('decodes hex audio chunks and skips the final summary chunk', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockSseResponse([
      { data: { audio: '00ff', status: 1 }, base_resp: { status_code: 0 } },
      // status 2 summary repeats the audio and must be ignored
      { data: { audio: '00ff', status: 2 }, base_resp: { status_code: 0 } },
    ]))

    const provider = await getSpeechProvider({ apiKey: 'test-key' })
    const fetchFn = provider.speech('speech-2.8-hd').fetch!
    const response = await fetchFn(new URL('http://test'), {
      body: JSON.stringify({ model: 'speech-2.8-hd', input: 'hello', voice: 'English_Graceful_Lady' }),
    })

    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(Array.from(bytes)).toEqual([0x00, 0xFF])
    expect(response.headers.get('Content-Type')).toBe('audio/mpeg')
  })

  it('surfaces MiniMax business errors from base_resp.status_code', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockSseResponse([
      { base_resp: { status_code: 1004, status_msg: 'account authentication failed' } },
    ]))

    const provider = await getSpeechProvider({ apiKey: 'bad-key' })
    const fetchFn = provider.speech('speech-2.8-hd').fetch!
    await expect(fetchFn(new URL('http://test'), {
      body: JSON.stringify({ model: 'speech-2.8-hd', input: 'hello', voice: 'English_Graceful_Lady' }),
    })).rejects.toThrow('account authentication failed')
  })

  it('throws when no audio data is returned', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(mockSseResponse([
      { data: { status: 2 }, base_resp: { status_code: 0 } },
    ]))

    const provider = await getSpeechProvider({ apiKey: 'test-key' })
    const fetchFn = provider.speech('speech-2.8-hd').fetch!
    await expect(fetchFn(new URL('http://test'), {
      body: JSON.stringify({ model: 'speech-2.8-hd', input: 'hello', voice: 'English_Graceful_Lady' }),
    })).rejects.toThrow('no audio data')
  })

  it('throws when the HTTP response is not OK', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('nope', { status: 500, statusText: 'Internal Server Error' }))

    const provider = await getSpeechProvider({ apiKey: 'test-key' })
    const fetchFn = provider.speech('speech-2.8-hd').fetch!
    await expect(fetchFn(new URL('http://test'), {
      body: JSON.stringify({ model: 'speech-2.8-hd', input: 'hello', voice: 'English_Graceful_Lady' }),
    })).rejects.toThrow('MiniMax TTS request failed: 500')
  })
})

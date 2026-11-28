import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { createMiniMaxVoiceClone, providerMinimaxSpeech } from './index'

function createSpeechProvider(config: Record<string, unknown> = {}) {
  return providerMinimaxSpeech.createProvider({
    apiKey: 'test-key',
    ...config,
  }) as SpeechProviderWithExtraOptions<string, Record<string, unknown>>
}

function mockSseResponse(events: unknown[]) {
  const body = events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
}

function mockJsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('miniMax speech provider metadata', () => {
  it('uses global defaults and exposes the current model catalog', async () => {
    const config = z.parse(await providerMinimaxSpeech.createProviderConfig({ t: (key: string) => key }), {
      apiKey: 'test-key',
    })
    const provider = await providerMinimaxSpeech.createProvider(config)
    const models = await providerMinimaxSpeech.extraMethods?.listModels?.(config, provider)

    expect(config).toMatchObject({
      baseUrl: 'https://api.minimax.io',
      model: 'speech-2.8-hd',
      voice: 'English_Graceful_Lady',
      format: 'mp3',
      output_format: 'hex',
    })
    expect(models?.map(model => model.id)).toEqual([
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

  it('tags account voices with every compatible speech model', async () => {
    const config = { apiKey: 'test-key' }
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(mockJsonResponse({ system_voice: [{ voice_id: 'Spanish_SereneWoman', voice_name: 'Serene Woman' }], base_resp: { status_code: 0 } })))
    const provider = await providerMinimaxSpeech.createProvider(config)
    const voices = await providerMinimaxSpeech.extraMethods?.listVoices?.(config, provider)

    expect(voices).toHaveLength(1)
    expect(voices?.[0]).toMatchObject({
      id: 'Spanish_SereneWoman',
      provider: 'minimax-speech',
    })
    expect(voices?.[0]?.compatibleModels).toHaveLength(8)
  })
})

describe('miniMax speech requests', () => {
  it.each([
    ['mp3', 'audio/mpeg'],
    ['wav', 'audio/wav'],
    ['flac', 'audio/flac'],
    ['pcm', 'audio/L16'],
  ])('decodes non-streaming %s output with its MIME type', async (format, mime) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockJsonResponse({
      data: { audio: '00ff' },
      base_resp: { status_code: 0 },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const options = createSpeechProvider({ format, stream: false }).speech('speech-2.8-hd')
    const response = await options.fetch!(new URL('https://example.com'), {
      body: JSON.stringify({ input: 'hello', voice: 'English_Graceful_Lady' }),
    })
    expect(response.headers.get('Content-Type')).toBe(mime)
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0, 255])
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toMatchObject({
      stream: false,
      output_format: 'hex',
      audio_setting: { format },
    })
  })

  it('uses the CN endpoint selected through baseUrl', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockSseResponse([
      { data: { audio: '0102', status: 1 }, base_resp: { status_code: 0 } },
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const speech = createSpeechProvider({ baseUrl: 'https://api.minimaxi.com/' }).speech('speech-2.8-hd')
    await speech.fetch?.(new URL('https://example.com'), {
      body: JSON.stringify({ input: 'hello', voice: 'English_Graceful_Lady' }),
    })

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.minimaxi.com/v1/t2a_v2')
    expect(speech.baseURL).toBe('https://api.minimaxi.com/v1/')
  })

  it('forwards synthesis controls and switches non-mp3 output to non-streaming', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockJsonResponse({
      data: { audio: '0102', status: 2 },
      base_resp: { status_code: 0 },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const speech = createSpeechProvider().speech('speech-2.8-hd', {
      pronunciation_dict: { tone: ['A/B'] },
      voice_modify: { pitch: 1 },
    })
    const response = await speech.fetch?.(new URL('https://example.com'), {
      body: JSON.stringify({
        input: 'hello',
        voice: 'Mandarin_Sweet_Girl',
        response_format: 'wav',
        speed: 1.2,
        vol: 0.8,
        pitch: 3,
        sample_rate: 24000,
        language_boost: 'English',
        subtitle_enable: true,
      }),
    })

    const request = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(request).toMatchObject({
      model: 'speech-2.8-hd',
      text: 'hello',
      stream: false,
      output_format: 'hex',
      voice_setting: {
        voice_id: 'Mandarin_Sweet_Girl',
        speed: 1.2,
        vol: 0.8,
        pitch: 3,
      },
      audio_setting: {
        sample_rate: 24000,
        bitrate: 128000,
        format: 'wav',
        channel: 1,
      },
      language_boost: 'English',
      subtitle_enable: true,
      pronunciation_dict: { tone: ['A/B'] },
      voice_modify: { pitch: 1 },
    })
    expect(response?.headers.get('Content-Type')).toBe('audio/wav')
    expect(Array.from(new Uint8Array(await response!.arrayBuffer()))).toEqual([1, 2])
  })

  it('decodes streaming hex chunks without duplicating the final summary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockSseResponse([
      { data: { audio: '00ff', status: 1 }, base_resp: { status_code: 0 } },
      { data: { audio: '00ff', status: 2 }, base_resp: { status_code: 0 } },
    ]))
    vi.stubGlobal('fetch', fetchMock)

    const response = await createSpeechProvider().speech('speech-2.8-hd').fetch?.(new URL('https://example.com'), {
      body: JSON.stringify({ input: 'hello', voice: 'English_Graceful_Lady' }),
    })
    const request = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(request.stream).toBe(true)
    expect(Array.from(new Uint8Array(await response!.arrayBuffer()))).toEqual([0, 255])
    expect(response?.headers.get('Content-Type')).toBe('audio/mpeg')
  })

  it('accepts audio supplied only by the final SSE summary', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(mockSseResponse([
      { data: { audio: '00ff', status: 2 }, base_resp: { status_code: 0 } },
    ])))
    const response = await createSpeechProvider().speech('speech-2.8-hd').fetch!(new URL('https://example.com'), {
      body: JSON.stringify({ input: 'hello' }),
    })
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0, 255])
  })

  it('rejects an empty URL download instead of returning silent success', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>()
      .mockResolvedValueOnce(mockJsonResponse({ data: { audio: 'https://audio.example.com/output.flac' } }))
      .mockResolvedValueOnce(new Response(new Uint8Array())))
    await expect(createSpeechProvider({ output_format: 'url' }).speech('speech-2.8-hd').fetch!(new URL('https://example.com'), {
      body: JSON.stringify({ input: 'hello' }),
    })).rejects.toThrow('no audio')
  })

  it('downloads URL output for non-streaming requests', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({
        data: { audio: 'https://audio.example.com/output.flac', status: 2 },
        base_resp: { status_code: 0 },
      }))
      .mockResolvedValueOnce(new Response(new Uint8Array([3, 4]), {
        status: 200,
        headers: { 'Content-Type': 'audio/flac' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await createSpeechProvider().speech('speech-2.8-hd', {
      format: 'flac',
      output_format: 'url',
    }).fetch?.(new URL('https://example.com'), {
      body: JSON.stringify({ input: 'hello' }),
    })
    const request = JSON.parse(fetchMock.mock.calls[0][1].body)

    expect(request).toMatchObject({ stream: false, output_format: 'url' })
    expect(fetchMock.mock.calls[1][0]).toBe('https://audio.example.com/output.flac')
    expect(Array.from(new Uint8Array(await response!.arrayBuffer()))).toEqual([3, 4])
  })

  it('surfaces MiniMax business errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockSseResponse([
      { base_resp: { status_code: 1004, status_msg: 'account authentication failed' } },
    ])))

    await expect(createSpeechProvider().speech('speech-2.8-hd').fetch?.(new URL('https://example.com'), {
      body: JSON.stringify({ input: 'hello' }),
    })).rejects.toThrow('account authentication failed')
  })

  it('rejects requests without input text', async () => {
    await expect(createSpeechProvider().speech('speech-2.8-hd').fetch?.(new URL('https://example.com'), {
      body: JSON.stringify({ model: 'speech-2.8-hd' }),
    })).rejects.toThrow('Missing input text')
  })
})

describe('miniMax voice cloning', () => {
  it('uploads clone audio and creates the voice on the selected regional endpoint', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mockJsonResponse({
        file: { file_id: 12345 },
        base_resp: { status_code: 0 },
      }))
      .mockResolvedValueOnce(mockJsonResponse({
        voice_id: 'CustomVoice01',
        base_resp: { status_code: 0 },
      }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createMiniMaxVoiceClone({
      apiKey: 'test-key',
      baseUrl: 'https://api.minimaxi.com/',
    }, {
      file: new Blob(['audio'], { type: 'audio/wav' }),
      fileName: 'sample.wav',
      voiceId: 'CustomVoice01',
      model: 'speech-2.8-hd',
    })

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.minimaxi.com/v1/files/upload')
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer test-key' })
    expect(fetchMock.mock.calls[0][1].body).toBeInstanceOf(FormData)
    expect(fetchMock.mock.calls[0][1].body.get('purpose')).toBe('voice_clone')
    expect(fetchMock.mock.calls[1][0]).toBe('https://api.minimaxi.com/v1/voice_clone')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      file_id: 12345,
      voice_id: 'CustomVoice01',
      model: 'speech-2.8-hd',
    })
    expect(result).toEqual({ fileId: 12345, voiceId: 'CustomVoice01' })
  })
})

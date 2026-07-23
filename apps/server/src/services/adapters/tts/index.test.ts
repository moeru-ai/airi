import { Buffer } from 'node:buffer'

import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../../utils/error'
import { getAdapter } from './index'

describe('getAdapter', () => {
  it('returns the azure adapter by id', () => {
    const adapter = getAdapter('azure')
    expect(adapter.id).toBe('azure')
  })

  it('returns the dashscope-cosyvoice adapter by id', () => {
    const adapter = getAdapter('dashscope-cosyvoice')
    expect(adapter.id).toBe('dashscope-cosyvoice')
  })

  it('returns the volcengine adapter by id', () => {
    const adapter = getAdapter('volcengine')
    expect(adapter.id).toBe('volcengine')
  })

  it('returns the stepfun adapter by id', () => {
    const adapter = getAdapter('stepfun')
    expect(adapter.id).toBe('stepfun')
  })

  it('throws BAD_REQUEST on unknown id with the available list in details', () => {
    expect(() => getAdapter('unknown-provider')).toThrow(ApiError)
    try {
      getAdapter('unknown-provider')
    }
    catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      const apiErr = err as ApiError
      expect(apiErr.statusCode).toBe(400)
      expect(apiErr.errorCode).toBe('BAD_REQUEST')
      expect(apiErr.details).toEqual(
        expect.objectContaining({
          id: 'unknown-provider',
          available: expect.arrayContaining(['azure', 'dashscope-cosyvoice', 'stepfun', 'volcengine']),
        }),
      )
    }
  })

  it('every adapter delegates getVoiceCatalog to unspeech and returns the parsed list', async () => {
    for (const id of ['dashscope-cosyvoice', 'volcengine'] as const) {
      const adapter = getAdapter(id)
      expect(typeof adapter.send).toBe('function')
      expect(typeof adapter.getVoiceCatalog).toBe('function')
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
        voices: [{ id: 'v1', name: 'v1' }],
      }), { status: 200 })) as unknown as typeof fetch

      const voices = await adapter.getVoiceCatalog({
        adapterParams: {},
        unspeechBaseURL: 'http://unspeech.local',
        fetchImpl,
      })
      expect(voices).toEqual([{ id: 'v1', name: 'v1' }])
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    }
  })
})

describe('dashscopeCosyvoiceAdapter.getVoiceCatalog', () => {
  it('calls unspeech with provider=alibaba + model (no Bearer)', async () => {
    const adapter = getAdapter('dashscope-cosyvoice')
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      voices: [{ id: 'longxiaochun_v2', name: 'Longxiaochun v2' }],
    }), { status: 200 })) as unknown as typeof fetch

    const voices = await adapter.getVoiceCatalog({
      adapterParams: { model: 'cosyvoice-v2' },
      unspeechBaseURL: 'http://unspeech.local',
      fetchImpl,
    })

    expect(voices).toEqual([{ id: 'longxiaochun_v2', name: 'Longxiaochun v2' }])
    const [calledUrl, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(calledUrl).toBe('http://unspeech.local/api/voices?provider=alibaba&model=cosyvoice-v2')
    const headers = (init.headers ?? {}) as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })

  it('throws 502 BAD_GATEWAY when unspeech non-2xx', async () => {
    const adapter = getAdapter('dashscope-cosyvoice')
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 502 })) as unknown as typeof fetch
    await expect(adapter.getVoiceCatalog({
      adapterParams: {},
      unspeechBaseURL: 'http://unspeech.local',
      fetchImpl,
    })).rejects.toMatchObject({ statusCode: 502 })
  })
})

describe('volcengineAdapter.getVoiceCatalog', () => {
  it('calls unspeech with provider=volcengine and forwards adapterParams.model as ?model=', async () => {
    const adapter = getAdapter('volcengine')
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      voices: [{ id: 'zh_female_x', name: 'X' }],
    }), { status: 200 })) as unknown as typeof fetch

    const voices = await adapter.getVoiceCatalog({
      adapterParams: { model: 'seed-tts-2.0' },
      unspeechBaseURL: 'http://unspeech.local',
      fetchImpl,
    })

    expect(voices).toEqual([{ id: 'zh_female_x', name: 'X' }])
    const [calledUrl] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(calledUrl).toBe('http://unspeech.local/api/voices?provider=volcengine&model=seed-tts-2.0')
  })

  it('omits ?model= when adapterParams.model is not set', async () => {
    const adapter = getAdapter('volcengine')
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ voices: [] }), { status: 200 })) as unknown as typeof fetch
    await adapter.getVoiceCatalog({
      adapterParams: {},
      unspeechBaseURL: 'http://unspeech.local',
      fetchImpl,
    })
    const [calledUrl] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(calledUrl).toBe('http://unspeech.local/api/voices?provider=volcengine')
  })
})

describe('azureAdapter.getVoiceCatalog', () => {
  it('sends bearer + region to unspeech and returns voices on 200', async () => {
    const adapter = getAdapter('azure')
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      voices: [{ id: 'en-US-AvaMultilingualNeural', name: 'Ava' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch

    const voices = await adapter.getVoiceCatalog({
      keyPlaintext: Buffer.from('subscription-key-XYZ', 'utf8'),
      region: 'eastasia',
      adapterParams: { region: 'eastasia' },
      unspeechBaseURL: 'http://unspeech.local:5933',
      fetchImpl,
    })

    expect(voices).toEqual([{ id: 'en-US-AvaMultilingualNeural', name: 'Ava' }])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [calledUrl, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(calledUrl).toBe('http://unspeech.local:5933/api/voices?provider=microsoft&region=eastasia')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer subscription-key-XYZ')
  })

  it('throws 503 AZURE_TTS_NOT_CONFIGURED when region is missing', async () => {
    const adapter = getAdapter('azure')
    await expect(adapter.getVoiceCatalog({
      keyPlaintext: Buffer.from('k', 'utf8'),
      adapterParams: {},
      unspeechBaseURL: 'http://unspeech.local',
      fetchImpl: vi.fn() as unknown as typeof fetch,
    })).rejects.toMatchObject({ statusCode: 503, errorCode: 'AZURE_TTS_NOT_CONFIGURED' })
  })

  it('throws 503 AZURE_TTS_NOT_CONFIGURED when keyPlaintext is missing', async () => {
    const adapter = getAdapter('azure')
    await expect(adapter.getVoiceCatalog({
      region: 'eastasia',
      adapterParams: { region: 'eastasia' },
      unspeechBaseURL: 'http://unspeech.local',
      fetchImpl: vi.fn() as unknown as typeof fetch,
    })).rejects.toMatchObject({ statusCode: 503, errorCode: 'AZURE_TTS_NOT_CONFIGURED' })
  })

  it('throws 502 BAD_GATEWAY when unspeech responds non-2xx', async () => {
    const adapter = getAdapter('azure')
    const fetchImpl = vi.fn(async () => new Response('upstream down', { status: 502 })) as unknown as typeof fetch
    await expect(adapter.getVoiceCatalog({
      keyPlaintext: Buffer.from('k', 'utf8'),
      region: 'eastasia',
      adapterParams: { region: 'eastasia' },
      unspeechBaseURL: 'http://unspeech.local',
      fetchImpl,
    })).rejects.toMatchObject({ statusCode: 502 })
  })

  it('throws 502 BAD_GATEWAY when unspeech fetch throws', async () => {
    const adapter = getAdapter('azure')
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    await expect(adapter.getVoiceCatalog({
      keyPlaintext: Buffer.from('k', 'utf8'),
      region: 'eastasia',
      adapterParams: { region: 'eastasia' },
      unspeechBaseURL: 'http://unspeech.local',
      fetchImpl,
    })).rejects.toMatchObject({ statusCode: 502 })
  })
})

describe('azureAdapter.send', () => {
  it('posts SSML to unspeech /v1/audio/speech with model=microsoft/v1 + region extra_body', async () => {
    const adapter = getAdapter('azure')
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    })) as unknown as typeof fetch

    await adapter.send(
      {
        text: 'hi there',
        voice: 'en-US-AvaMultilingualNeural',
        speed: 1.2,
        extraOptions: {
          pitch: 20,
          volume: 5,
        },
      },
      {
        keyPlaintext: Buffer.from('azure-sub-key', 'utf8'),
        baseURL: 'https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1',
        unspeechBaseURL: 'http://unspeech.local:5933',
        adapterParams: { region: 'eastasia' },
        fetchImpl,
      },
    )

    const [calledURL, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(calledURL).toBe('http://unspeech.local:5933/v1/audio/speech')
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.model).toBe('microsoft/v1')
    expect(body.voice).toBe('en-US-AvaMultilingualNeural')
    expect((body.extra_body as { region?: string }).region).toBe('eastasia')
    expect((body.extra_body as { disable_ssml?: boolean }).disable_ssml).toBe(true)
    // SSML is built on our side so speed survives — verify the prosody tag is in
    // the input field unspeech receives.
    expect(body.input).toContain('<prosody rate=\'+20%\' pitch=\'+20%\' volume=\'+5%\'>')
    expect(body.input).toContain('hi there')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer azure-sub-key')
  })

  it('uses adapterParams.defaultVoice when the request omits voice', async () => {
    const adapter = getAdapter('azure')
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    })) as unknown as typeof fetch

    await adapter.send(
      { text: 'hi there' },
      {
        keyPlaintext: Buffer.from('azure-sub-key', 'utf8'),
        baseURL: 'https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1',
        unspeechBaseURL: 'http://unspeech.local:5933',
        adapterParams: { region: 'eastasia', defaultVoice: 'en-US-AvaMultilingualNeural' },
        fetchImpl,
      },
    )

    const [, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body.voice).toBe('en-US-AvaMultilingualNeural')
  })

  it('rejects missing voice when adapterParams.defaultVoice is not configured', async () => {
    const adapter = getAdapter('azure')
    const fetchImpl = vi.fn() as unknown as typeof fetch

    await expect(adapter.send(
      { text: 'hi' },
      {
        keyPlaintext: Buffer.from('k', 'utf8'),
        baseURL: 'https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1',
        unspeechBaseURL: 'http://unspeech.local:5933',
        adapterParams: { region: 'eastasia' },
        fetchImpl,
      },
    )).rejects.toMatchObject({ statusCode: 400 })

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('throws Error with .status when unspeech non-2xx', async () => {
    const adapter = getAdapter('azure')
    const fetchImpl = vi.fn(async () => new Response('upstream rejected', { status: 401 })) as unknown as typeof fetch

    await expect(adapter.send(
      { text: 'hi', voice: 'en-US-AvaMultilingualNeural' },
      {
        keyPlaintext: Buffer.from('k', 'utf8'),
        baseURL: 'https://eastasia.tts.speech.microsoft.com/cognitiveservices/v1',
        unspeechBaseURL: 'http://unspeech.local:5933',
        adapterParams: { region: 'eastasia' },
        fetchImpl,
      },
    )).rejects.toMatchObject({ status: 401 })
  })
})

describe('stepfunAdapter', () => {
  it('lists StepFun voices through unspeech provider=stepfun', async () => {
    const adapter = getAdapter('stepfun')
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      voices: [{
        id: 'cixingnansheng',
        name: '磁性男声',
        compatible_models: ['stepaudio-2.5-tts', 'step-tts-2', 'step-tts-mini'],
      }],
    }), { status: 200 })) as unknown as typeof fetch

    const voices = await adapter.getVoiceCatalog({
      adapterParams: {},
      unspeechBaseURL: 'http://unspeech.local',
      fetchImpl,
    })

    expect(voices).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'cixingnansheng',
          name: '磁性男声',
          compatible_models: expect.arrayContaining(['stepaudio-2.5-tts', 'step-tts-2', 'step-tts-mini']),
        }),
      ]),
    )
    const [calledUrl] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(calledUrl).toBe('http://unspeech.local/api/voices?provider=stepfun')
  })

  it('posts OpenAI-compatible speech JSON to unspeech with model=stepfun/<model>', async () => {
    const adapter = getAdapter('stepfun')
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    })) as unknown as typeof fetch

    const result = await adapter.send(
      {
        text: '（轻声）你好',
        voice: 'cixingnansheng',
        responseFormat: 'mp3',
        speed: 1.2,
        extraOptions: {
          instruction: '温柔、克制、有一点笑意',
          volume: 1.1,
          sampleRate: 24000,
        },
      },
      {
        keyPlaintext: Buffer.from('step-key', 'utf8'),
        baseURL: 'https://api.stepfun.com/v1/audio/speech',
        unspeechBaseURL: 'http://unspeech.local:5933',
        adapterParams: { model: 'stepaudio-2.5-tts' },
        fetchImpl,
      },
    )

    const [calledURL, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(calledURL).toBe('http://unspeech.local:5933/v1/audio/speech')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      'Authorization': 'Bearer step-key',
      'Content-Type': 'application/json',
    })
    const body = JSON.parse(init.body as string) as Record<string, unknown>
    expect(body).toEqual({
      model: 'stepfun/stepaudio-2.5-tts',
      input: '（轻声）你好',
      voice: 'cixingnansheng',
      response_format: 'mp3',
      speed: 1.2,
      extra_body: {
        volume: 1.1,
        sample_rate: 24000,
        instruction: '温柔、克制、有一点笑意',
      },
    })
    expect(result.contentType).toBe('audio/mpeg')
    expect(result.body).toBeInstanceOf(ArrayBuffer)
  })

  it('passes voice_label through to unspeech for provider-level validation', async () => {
    const adapter = getAdapter('stepfun')
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    })) as unknown as typeof fetch

    await adapter.send(
      {
        text: 'hi',
        extraOptions: {
          voice_label: { emotion: '高兴' },
        },
      },
      {
        keyPlaintext: Buffer.from('step-key', 'utf8'),
        baseURL: 'https://api.stepfun.com/v1/audio/speech',
        unspeechBaseURL: 'http://unspeech.local',
        adapterParams: { model: 'stepaudio-2.5-tts' },
        fetchImpl,
      },
    )

    const [, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    const body = JSON.parse(init.body as string) as Record<string, { voice_label?: unknown }>
    expect(body.extra_body.voice_label).toEqual({ emotion: '高兴' })
  })

  it('throws Error with .status when unspeech returns non-2xx', async () => {
    const adapter = getAdapter('stepfun')
    const fetchImpl = vi.fn(async () => new Response('bad key', { status: 401 })) as unknown as typeof fetch

    await expect(adapter.send(
      { text: 'hi', voice: 'cixingnansheng' },
      {
        keyPlaintext: Buffer.from('bad-key', 'utf8'),
        baseURL: 'https://api.stepfun.com/v1/audio/speech',
        unspeechBaseURL: 'http://unspeech.local',
        adapterParams: { model: 'stepaudio-2.5-tts' },
        fetchImpl,
      },
    )).rejects.toMatchObject({ status: 401 })
  })
})

describe('volcengineAdapter.send', () => {
  it('posts to unspeech with model=volcengine/<api_resource_id> and app/cluster in extra_body', async () => {
    const adapter = getAdapter('volcengine')
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([0x49, 0x44, 0x33]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    })) as unknown as typeof fetch

    const result = await adapter.send(
      { text: 'hi', voice: 'BV001_streaming', responseFormat: 'mp3', speed: 1.0 },
      {
        keyPlaintext: Buffer.from('volc-token', 'utf8'),
        baseURL: 'https://openspeech.bytedance.com/api/v1/tts',
        unspeechBaseURL: 'http://unspeech.local:5933',
        adapterParams: { appid: 'APP-123', cluster: 'volcano_tts', model: 'seed-tts-2.0' },
        fetchImpl,
      },
    )

    const [calledURL, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(calledURL).toBe('http://unspeech.local:5933/v1/audio/speech')
    const body = JSON.parse(init.body as string) as Record<string, any>
    expect(body.model).toBe('volcengine/seed-tts-2.0')
    expect(body.voice).toBe('BV001_streaming')
    expect(body.response_format).toBe('mp3')
    expect(body.extra_body.app).toEqual({ appid: 'APP-123', cluster: 'volcano_tts' })
    expect(typeof body.extra_body.request.reqid).toBe('string')
    expect(body.extra_body.request.operation).toBe('query')

    // Plain Bearer — unspeech itself re-attaches as `Bearer; <token>` to the
    // upstream Volcengine call.
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer volc-token')

    expect(result.contentType).toBe('audio/mpeg')
    expect(result.body).toBeInstanceOf(ArrayBuffer)
  })

  /**
   * @example
   * volcengineAdapter.send({ text: 'hi', extraOptions: { pitch: 20 } }, ctx)
   */
  it('fails fast when Voice Pack pitch or volume params reach Volcengine', async () => {
    const adapter = getAdapter('volcengine')
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([0x49]))) as unknown as typeof fetch

    await expect(adapter.send(
      {
        text: 'hi',
        voice: 'BV001_streaming',
        extraOptions: {
          pitch: 20,
        },
      },
      {
        keyPlaintext: Buffer.from('volc-token', 'utf8'),
        baseURL: 'https://openspeech.bytedance.com/api/v1/tts',
        unspeechBaseURL: 'http://unspeech.local:5933',
        adapterParams: { appid: 'APP-123' },
        fetchImpl,
      },
    )).rejects.toMatchObject({ statusCode: 400 })

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects when adapterParams.appid is missing', async () => {
    const adapter = getAdapter('volcengine')
    const fetchImpl = vi.fn() as unknown as typeof fetch
    await expect(adapter.send(
      { text: 'hi' },
      {
        keyPlaintext: Buffer.from('k', 'utf8'),
        baseURL: 'https://openspeech.bytedance.com/api/v1/tts',
        unspeechBaseURL: 'http://unspeech.local:5933',
        adapterParams: {},
        fetchImpl,
      },
    )).rejects.toMatchObject({ statusCode: 500 })
  })
})

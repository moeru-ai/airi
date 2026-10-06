import { Buffer } from 'node:buffer'

import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../../utils/error'
import { getAdapter } from './index'
import { TtsUpstreamResponseError } from './types'

describe('getAdapter', () => {
  it('returns the dashscope-cosyvoice adapter by id', () => {
    const adapter = getAdapter('dashscope-cosyvoice')
    expect(adapter.id).toBe('dashscope-cosyvoice')
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
          available: expect.arrayContaining(['dashscope-cosyvoice', 'stepfun']),
        }),
      )
    }
  })

  it('every adapter delegates getVoiceCatalog to unspeech and returns the parsed list', async () => {
    for (const id of ['dashscope-cosyvoice', 'stepfun'] as const) {
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

describe('stepfunAdapter', () => {
  it('uses unspeech as the StepFun voice-catalog source', async () => {
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
    expect(fetchImpl).toHaveBeenCalledTimes(1)
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
        baseURL: 'https://api.stepfun.com',
        unspeechBaseURL: 'http://unspeech.local:5933',
        adapterParams: { model: 'stepaudio-2.5-tts' },
        fetchImpl,
      },
    )

    const [calledURL, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(String(calledURL)).toBe('http://unspeech.local:5933/v1/audio/speech')
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

  it('passes the Step Plan endpoint profile to unspeech', async () => {
    const adapter = getAdapter('stepfun')
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    })) as unknown as typeof fetch

    const result = await adapter.send(
      {
        text: '你好',
        voice: 'cixingnansheng',
        responseFormat: 'mp3',
        speed: 1.1,
        extraOptions: {
          instruction: '温柔、克制',
        },
      },
      {
        keyPlaintext: Buffer.from('step-plan-key', 'utf8'),
        baseURL: 'https://api.stepfun.com',
        unspeechBaseURL: 'http://unspeech.local:5933',
        adapterParams: {
          endpointProfile: 'step-plan',
          model: 'stepaudio-2.5-tts',
        },
        fetchImpl,
      },
    )

    const [calledURL, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect(String(calledURL)).toBe('http://unspeech.local:5933/v1/audio/speech')
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({
      'Authorization': 'Bearer step-plan-key',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'stepfun/stepaudio-2.5-tts',
      input: '你好',
      voice: 'cixingnansheng',
      response_format: 'mp3',
      speed: 1.1,
      extra_body: {
        endpoint_profile: 'step-plan',
        instruction: '温柔、克制',
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
        baseURL: 'https://api.stepfun.com',
        unspeechBaseURL: 'http://unspeech.local',
        adapterParams: { model: 'stepaudio-2.5-tts' },
        fetchImpl,
      },
    )

    const [, init] = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    const body = JSON.parse(init.body as string) as Record<string, { voice_label?: unknown }>
    expect(body.extra_body.voice_label).toEqual({ emotion: '高兴' })
  })

  it('throws TtsUpstreamResponseError when unspeech returns non-2xx', async () => {
    const adapter = getAdapter('stepfun')
    const fetchImpl = vi.fn(async () => new Response('bad key', { status: 401 })) as unknown as typeof fetch

    let caught: unknown
    try {
      await adapter.send(
        { text: 'hi', voice: 'cixingnansheng' },
        {
          keyPlaintext: Buffer.from('bad-key', 'utf8'),
          baseURL: 'https://api.stepfun.com',
          unspeechBaseURL: 'http://unspeech.local',
          adapterParams: { model: 'stepaudio-2.5-tts' },
          fetchImpl,
        },
      )
    }
    catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(TtsUpstreamResponseError)
    if (!(caught instanceof TtsUpstreamResponseError))
      throw caught
    expect(caught.response.status).toBe(401)
  })

  it('preserves an unspeech request abort for router timeout classification', async () => {
    const adapter = getAdapter('stepfun')
    const abortController = new AbortController()
    const abortError = new Error('attempt-timeout')
    abortController.abort(abortError)
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      throw init?.signal?.reason ?? new Error('aborted')
    }) as unknown as typeof fetch

    await expect(adapter.send(
      { text: 'hi', voice: 'cixingnansheng' },
      {
        keyPlaintext: Buffer.from('step-key', 'utf8'),
        baseURL: 'https://api.stepfun.com',
        unspeechBaseURL: 'http://unspeech.local',
        adapterParams: { model: 'stepaudio-2.5-tts' },
        fetchImpl,
        abortSignal: abortController.signal,
      },
    )).rejects.toBe(abortError)
  })
})

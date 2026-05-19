import { Buffer } from 'node:buffer'

import { describe, expect, it, vi } from 'vitest'

import { dashscopeCosyvoiceAdapter } from './dashscope-cosyvoice'

const FULL_ENDPOINT = 'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer'
const AUDIO_URL = 'https://dashscope-internal.aliyuncs.com/audio/abc.mp3'

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function binaryResponse(bytes: Uint8Array, status = 200) {
  return new Response(bytes, {
    status,
    headers: { 'content-type': 'audio/mpeg' },
  })
}

describe('dashscopeCosyvoiceAdapter', () => {
  it('sends v2-shaped body: voice / format under input, not parameters (regression — old shape returned no audio.data)', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ output: { audio: { url: AUDIO_URL } } }))
      .mockResolvedValueOnce(binaryResponse(new Uint8Array([1, 2, 3, 4])))

    await dashscopeCosyvoiceAdapter.send(
      { text: 'hi there', voice: 'longxiaochun_v2', responseFormat: 'mp3' },
      {
        keyPlaintext: Buffer.from('sk-test', 'utf8'),
        baseURL: FULL_ENDPOINT,
        adapterParams: { model: 'cosyvoice-v2' },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
    )

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const [synthesizeUrl, synthesizeInit] = fetchImpl.mock.calls[0]
    expect(synthesizeUrl).toBe(FULL_ENDPOINT)
    expect(synthesizeInit.method).toBe('POST')

    const body = JSON.parse(synthesizeInit.body as string)
    expect(body).toEqual({
      model: 'cosyvoice-v2',
      input: {
        text: 'hi there',
        voice: 'longxiaochun_v2',
        format: 'mp3',
      },
    })
    // Critical: voice / format must NOT leak into a top-level `parameters` block.
    expect(body.parameters).toBeUndefined()
  })

  it('follows output.audio.url to fetch the actual audio bytes and returns them as ArrayBuffer (regression — v1 parsed base64 from output.audio.data, v2 returns a URL instead)', async () => {
    const audioBytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]) // ID3v2 mp3 header
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ output: { audio: { url: AUDIO_URL, data: '' } } }))
      .mockResolvedValueOnce(binaryResponse(audioBytes))

    const result = await dashscopeCosyvoiceAdapter.send(
      { text: 'hi', responseFormat: 'mp3' },
      {
        keyPlaintext: Buffer.from('sk-test', 'utf8'),
        baseURL: FULL_ENDPOINT,
        adapterParams: {},
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
    )

    const [audioFetchUrl, audioFetchInit] = fetchImpl.mock.calls[1]
    expect(audioFetchUrl).toBe(AUDIO_URL)
    expect(audioFetchInit.method).toBe('GET')

    expect(result.contentType).toBe('audio/mpeg')
    expect(result.body).toBeInstanceOf(ArrayBuffer)
    const out = new Uint8Array(result.body as ArrayBuffer)
    expect(Array.from(out)).toEqual(Array.from(audioBytes))
  })

  it('throws Error with .status when synthesis endpoint returns non-2xx (router maps to fallback chain)', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ code: 'InvalidApiKey', message: 'bad key' }, 401))

    await expect(
      dashscopeCosyvoiceAdapter.send(
        { text: 'hi' },
        {
          keyPlaintext: Buffer.from('sk-test', 'utf8'),
          baseURL: FULL_ENDPOINT,
          adapterParams: {},
          fetchImpl: fetchImpl as unknown as typeof fetch,
        },
      ),
    ).rejects.toMatchObject({ status: 401, message: expect.stringContaining('401') })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('throws Error with .status when output envelope contains no audio.url (treat as recoverable upstream error)', async () => {
    // ROOT CAUSE:
    //
    // CosyVoice v2 non-streaming returns audio.url; if upstream returns 200
    // with an empty envelope (rare — policy reject / region edge case), the
    // v1 adapter silently returned "no audio data" while modeled status was
    // 200. Router can't decide whether to fall back without a status. We
    // attach the response status to the error so the router treats it as a
    // recoverable upstream failure and walks to the next key.
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ output: {} }))

    await expect(
      dashscopeCosyvoiceAdapter.send(
        { text: 'hi' },
        {
          keyPlaintext: Buffer.from('sk-test', 'utf8'),
          baseURL: FULL_ENDPOINT,
          adapterParams: {},
          fetchImpl: fetchImpl as unknown as typeof fetch,
        },
      ),
    ).rejects.toMatchObject({ status: 200, message: expect.stringContaining('no audio.url') })
  })

  it('uses cosyvoice-v2 + longxiaochun_v2 as defaults when caller omits model / voice (regression — v1 defaults broke against the v2 endpoint)', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ output: { audio: { url: AUDIO_URL } } }))
      .mockResolvedValueOnce(binaryResponse(new Uint8Array([0])))

    await dashscopeCosyvoiceAdapter.send(
      { text: 'hi' },
      {
        keyPlaintext: Buffer.from('sk-test', 'utf8'),
        baseURL: FULL_ENDPOINT,
        adapterParams: {},
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
    )

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string)
    expect(body.model).toBe('cosyvoice-v2')
    expect(body.input.voice).toBe('longxiaochun_v2')
    expect(body.input.format).toBe('mp3')
  })

  it('voice catalog contains v2-suffixed ids and is non-empty', () => {
    const catalog = dashscopeCosyvoiceAdapter.getVoiceCatalog()
    expect(catalog.length).toBeGreaterThan(0)
    expect(catalog.some(v => v.id === 'longxiaochun_v2')).toBe(true)
    // No bare v1 ids should survive the migration.
    expect(catalog.find(v => v.id === 'longxiaochun')).toBeUndefined()
    expect(catalog.find(v => v.id === 'longxiaobai')).toBeUndefined()
  })
})

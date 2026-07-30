import { Buffer } from 'node:buffer'

import { describe, expect, it, vi } from 'vitest'

import { dashscopeCosyvoiceAdapter } from './dashscope-cosyvoice'

const UNSPEECH = 'http://unspeech.local:5933'
const SPEECH_URL = `${UNSPEECH}/v1/audio/speech`

function binaryResponse(bytes: Uint8Array, status = 200) {
  return new Response(bytes, {
    status,
    headers: { 'content-type': 'audio/mpeg' },
  })
}

describe('dashscopeCosyvoiceAdapter', () => {
  it('forwards to unspeech with model=alibaba/<adapterParams.model>, voice + response_format passthrough', async () => {
    const audioBytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]) // ID3v2 mp3 header
    const fetchImpl = vi.fn().mockResolvedValueOnce(binaryResponse(audioBytes))

    const result = await dashscopeCosyvoiceAdapter.send(
      { text: 'hi there', voice: 'longxiaochun_v2', responseFormat: 'mp3' },
      {
        keyPlaintext: Buffer.from('sk-test', 'utf8'),
        baseURL: 'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer',
        unspeechBaseURL: UNSPEECH,
        adapterParams: { model: 'cosyvoice-v2' },
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
    )

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [calledURL, init] = fetchImpl.mock.calls[0]
    expect(calledURL).toBe(SPEECH_URL)
    expect(init.method).toBe('POST')

    const body = JSON.parse(init.body as string)
    expect(body).toEqual({
      model: 'alibaba/cosyvoice-v2',
      input: 'hi there',
      voice: 'longxiaochun_v2',
      response_format: 'mp3',
    })

    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk-test')

    expect(result.contentType).toBe('audio/mpeg')
    expect(result.body).toBeInstanceOf(ArrayBuffer)
    const out = new Uint8Array(result.body as ArrayBuffer)
    expect(Array.from(out)).toEqual(Array.from(audioBytes))
  })

  it('throws Error with .status when unspeech returns non-2xx (router walks to next key)', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('bad key', { status: 401 }))

    await expect(
      dashscopeCosyvoiceAdapter.send(
        { text: 'hi', voice: 'longxiaochun_v2' },
        {
          keyPlaintext: Buffer.from('sk-test', 'utf8'),
          baseURL: 'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer',
          unspeechBaseURL: UNSPEECH,
          adapterParams: {},
          fetchImpl: fetchImpl as unknown as typeof fetch,
        },
      ),
    ).rejects.toMatchObject({ status: 401, message: expect.stringContaining('401') })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects missing voice instead of hardcoding a model-specific default', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(binaryResponse(new Uint8Array([0])))

    await expect(dashscopeCosyvoiceAdapter.send(
      { text: 'hi' },
      {
        keyPlaintext: Buffer.from('sk-test', 'utf8'),
        baseURL: 'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer',
        unspeechBaseURL: UNSPEECH,
        adapterParams: {},
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
    )).rejects.toMatchObject({ statusCode: 400 })

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  /**
   * @example
   * dashscopeCosyvoiceAdapter.send({ text: 'hi', extraOptions: { volume: 5 } }, ctx)
   */
  it('fails fast when Voice Pack pitch or volume params reach DashScope cosyvoice', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(binaryResponse(new Uint8Array([0])))

    await expect(dashscopeCosyvoiceAdapter.send(
      {
        text: 'hi',
        voice: 'longxiaochun_v2',
        extraOptions: {
          volume: 5,
        },
      },
      {
        keyPlaintext: Buffer.from('sk-test', 'utf8'),
        baseURL: 'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer',
        unspeechBaseURL: UNSPEECH,
        adapterParams: {},
        fetchImpl: fetchImpl as unknown as typeof fetch,
      },
    )).rejects.toMatchObject({ statusCode: 400 })

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('voice catalog is proxied through unspeech with the selected cosyvoice model', async () => {
    // The catalog itself is unspeech-owned now (embedded JSON in
    // unspeech/pkg/backend/alibaba/voices.go). This test only verifies the
    // wire contract — fixture content is intentionally minimal so an
    // unspeech-side roster change doesn't break us.
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      voices: [{ id: 'longxiaochun_v2', name: 'Longxiaochun v2' }],
    }), { status: 200 })) as unknown as typeof fetch
    const catalog = await dashscopeCosyvoiceAdapter.getVoiceCatalog({
      adapterParams: { model: 'cosyvoice-v2' },
      unspeechBaseURL: UNSPEECH,
      fetchImpl,
    })
    expect(catalog).toEqual([{ id: 'longxiaochun_v2', name: 'Longxiaochun v2' }])
    expect(fetchImpl).toHaveBeenCalledWith(
      `${UNSPEECH}/api/voices?provider=alibaba&model=cosyvoice-v2`,
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
      }),
    )
  })
})

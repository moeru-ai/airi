import { Buffer } from 'node:buffer'

import { describe, expect, it, vi } from 'vitest'

import { dashscopeCosyvoiceAdapter } from './dashscope-cosyvoice'

const UNSPEECH = 'http://unspeech.local:5933'
const SPEECH_URL = `${UNSPEECH}/v1/audio/speech`

function binaryResponse(bytes: Uint8Array, status = 200) {
  return new Response(bytes, {
    headers: { 'content-type': 'audio/mpeg' },
    status,
  })
}

describe('dashscopeCosyvoiceAdapter', () => {
  it('forwards to unspeech with model=alibaba/<adapterParams.model>, voice + response_format passthrough', async () => {
    const audioBytes = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00]) // ID3v2 mp3 header
    const fetchImpl = vi.fn().mockResolvedValueOnce(binaryResponse(audioBytes))

    const result = await dashscopeCosyvoiceAdapter.send(
      { responseFormat: 'mp3', text: 'hi there', voice: 'longxiaochun_v2' },
      {
        adapterParams: { model: 'cosyvoice-v2' },
        baseURL: 'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer',
        fetchImpl: fetchImpl as unknown as typeof fetch,
        keyPlaintext: Buffer.from('sk-test', 'utf8'),
        unspeechBaseURL: UNSPEECH,
      },
    )

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [calledURL, init] = fetchImpl.mock.calls[0]
    expect(calledURL).toBe(SPEECH_URL)
    expect(init.method).toBe('POST')

    const body = JSON.parse(init.body as string)
    expect(body).toEqual({
      input: 'hi there',
      model: 'alibaba/cosyvoice-v2',
      response_format: 'mp3',
      voice: 'longxiaochun_v2',
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
          adapterParams: {},
          baseURL: 'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer',
          fetchImpl: fetchImpl as unknown as typeof fetch,
          keyPlaintext: Buffer.from('sk-test', 'utf8'),
          unspeechBaseURL: UNSPEECH,
        },
      ),
    ).rejects.toMatchObject({ message: expect.stringContaining('401'), status: 401 })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects missing voice instead of hardcoding a model-specific default', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(binaryResponse(new Uint8Array([0])))

    await expect(dashscopeCosyvoiceAdapter.send(
      { text: 'hi' },
      {
        adapterParams: {},
        baseURL: 'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer',
        fetchImpl: fetchImpl as unknown as typeof fetch,
        keyPlaintext: Buffer.from('sk-test', 'utf8'),
        unspeechBaseURL: UNSPEECH,
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
        extraOptions: {
          volume: 5,
        },
        text: 'hi',
        voice: 'longxiaochun_v2',
      },
      {
        adapterParams: {},
        baseURL: 'https://dashscope-intl.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer',
        fetchImpl: fetchImpl as unknown as typeof fetch,
        keyPlaintext: Buffer.from('sk-test', 'utf8'),
        unspeechBaseURL: UNSPEECH,
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
      fetchImpl,
      unspeechBaseURL: UNSPEECH,
    })
    expect(catalog).toEqual([{ id: 'longxiaochun_v2', name: 'Longxiaochun v2' }])
    expect(fetchImpl).toHaveBeenCalledWith(
      `${UNSPEECH}/api/voices?provider=alibaba&model=cosyvoice-v2`,
      expect.objectContaining({
        headers: { Accept: 'application/json' },
        method: 'GET',
      }),
    )
  })
})

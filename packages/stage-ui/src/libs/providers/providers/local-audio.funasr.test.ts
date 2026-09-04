import type { ComposerTranslation } from 'vue-i18n'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerFunASRAudioTranscription } from './local-audio'

const translate = ((key: string, parameters?: Record<string, unknown>) => {
  if (key === 'settings.pages.providers.catalog.edit.validators.funasr.invalid-base-url')
    return 'FunASR 地址必须是绝对 HTTP(S) URL。'
  if (key === 'settings.pages.providers.catalog.edit.validators.funasr.connectivity-failed')
    return `无法连接 FunASR OpenAI 兼容端点：${parameters?.error}`
  return key
}) as unknown as ComposerTranslation

describe('funasr local audio provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requires a reachable OpenAI-compatible models endpoint', async () => {
    const validator = await providerFunASRAudioTranscription.validators?.validateProvider?.[0]({ t: translate })
    const provider = await providerFunASRAudioTranscription.createProvider({ baseUrl: 'http://localhost:8000/v1/' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce({ json: async () => ({ data: [] }), ok: true, status: 200 })
    const reachable = await validator?.validator(
      { baseUrl: 'http://localhost:8000/v1/' },
      provider,
      {},
      { t: translate },
    )

    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 })
    const wrongPath = await validator?.validator(
      { baseUrl: 'http://localhost:8000/wrong/' },
      provider,
      {},
      { t: translate },
    )

    expect(fetchMock).toHaveBeenNthCalledWith(1, 'http://localhost:8000/v1/models', expect.any(Object))
    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://localhost:8000/wrong/models', expect.any(Object))
    expect(reachable?.valid).toBe(true)
    expect(wrongPath?.valid).toBe(false)
    expect(wrongPath?.reason).toBe('无法连接 FunASR OpenAI 兼容端点：HTTP 404')
  })

  it('requires saved endpoint configuration without requiring an API key', () => {
    expect(providerFunASRAudioTranscription.requiresCredentials).toBeUndefined()
    expect(providerFunASRAudioTranscription.validationRequiredWhen?.({ baseUrl: 'http://localhost:8000/v1/' }))
      .toBe(true)
  })

  // https://github.com/moeru-ai/airi/pull/2435#discussion_r3920910278
  it('lists the models from the configured FunASR endpoint for PR #2435', async () => {
    // ROOT CAUSE:
    //
    // The provider returned a fixed model list and ignored the server response.
    // A custom endpoint can require model ids that are not in that fixed list.
    const config = {
      apiKey: 'funasr-secret',
      baseUrl: 'http://localhost:9000/custom/v1/',
    }
    const provider = await providerFunASRAudioTranscription.createProvider(config)
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { created: 0, id: 'custom-sensevoice', object: 'model', owned_by: 'funasr' },
        { created: 0, id: 'custom-paraformer', object: 'model', owned_by: 'funasr' },
      ],
      object: 'list',
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }))
    vi.stubGlobal('fetch', fetchMock)

    const models = await providerFunASRAudioTranscription.extraMethods?.listModels?.(config, provider)

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://localhost:9000/custom/v1/models')
    expect(models).toEqual([
      {
        contextLength: 0,
        deprecated: false,
        id: 'custom-sensevoice',
        name: 'custom-sensevoice',
        provider: 'funasr-audio-transcription',
      },
      {
        contextLength: 0,
        deprecated: false,
        id: 'custom-paraformer',
        name: 'custom-paraformer',
        provider: 'funasr-audio-transcription',
      },
    ])
  })

  it('rejects relative endpoint URLs before fetching models', async () => {
    const validator = await providerFunASRAudioTranscription.validators?.validateProvider?.[0]({ t: translate })
    const provider = await providerFunASRAudioTranscription.createProvider({ baseUrl: 'localhost:8000/v1/' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await validator?.validator(
      { baseUrl: 'localhost:8000/v1/' },
      provider,
      {},
      { t: translate },
    )

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result?.valid).toBe(false)
    expect(result?.reason).toBe('FunASR 地址必须是绝对 HTTP(S) URL。')
  })

  it('rejects successful responses that are not OpenAI model lists', async () => {
    const validator = await providerFunASRAudioTranscription.validators?.validateProvider?.[0]({ t: translate })
    const provider = await providerFunASRAudioTranscription.createProvider({ baseUrl: 'http://localhost:8000/v1/' })
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true }), ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    const result = await validator?.validator(
      { baseUrl: 'http://localhost:8000/v1/' },
      provider,
      {},
      { t: translate },
    )

    expect(result?.valid).toBe(false)
    expect(result?.reason).toBe('无法连接 FunASR OpenAI 兼容端点：Unexpected /models response')
  })
})

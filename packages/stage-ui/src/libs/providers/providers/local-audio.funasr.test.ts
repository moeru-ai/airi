import type { ComposerTranslation } from 'vue-i18n'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerFunASRAudioTranscription } from './local-audio'

const translate = ((key: string) => key) as unknown as ComposerTranslation

describe('funasr local audio provider', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('requires a reachable OpenAI-compatible models endpoint', async () => {
    const validator = await providerFunASRAudioTranscription.validators?.validateProvider?.[0]({ t: translate })
    const provider = await providerFunASRAudioTranscription.createProvider({ baseUrl: 'http://localhost:8000/v1/' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 })
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
    expect(wrongPath?.reason).toContain('HTTP 404')
  })

  it('requires saved endpoint configuration without requiring an API key', () => {
    expect(providerFunASRAudioTranscription.requiresCredentials).toBeUndefined()
    expect(providerFunASRAudioTranscription.validationRequiredWhen?.({ baseUrl: 'http://localhost:8000/v1/' }))
      .toBe(true)
  })
})

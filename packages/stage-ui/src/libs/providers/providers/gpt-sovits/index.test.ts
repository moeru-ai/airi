import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerGptSovits } from './index'

const config = {
  baseUrl: 'http://localhost:9880',
  refAudioPath: '/reference.wav',
  promptText: '',
  promptLang: 'zh',
  textLang: 'en',
  gptWeightsPath: '',
  sovitsWeightsPath: '',
}
const context = { t: (key: string) => key }

afterEach(() => vi.unstubAllGlobals())

describe('gpt-sovits configuration', () => {
  it('probes the stock OpenAPI route without changing weights', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetch)
    const validator = await providerGptSovits.validators!.validateConfig![0](context)
    const result = await validator.validator(config, context)
    expect(result.valid).toBe(true)
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:9880/openapi.json')
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('rejects unknown language codes before any network call', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    const validator = await providerGptSovits.validators!.validateConfig![0](context)
    const result = await validator.validator({ ...config, textLang: 'typo' }, context)
    expect(result.valid).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uses the translated required-field key', async () => {
    const validator = await providerGptSovits.validators!.validateConfig![0](context)
    const result = await validator.validator({ ...config, refAudioPath: '' }, context)
    expect(result.reason).toBe('settings.pages.providers.provider.gpt-sovits.fields.validation.refAudioRequired')
  })
})

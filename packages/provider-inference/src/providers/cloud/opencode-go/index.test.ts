import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerOpenCodeGo } from './index'

const config = { apiKey: 'example-key', baseUrl: 'https://example.com/v1/' }
const context = { t: (key: string) => key }

describe('openCode Go direct provider', () => {
  afterEach(() => vi.restoreAllMocks())

  it('keeps catalog namespaces local and sends the unprefixed model to the configured endpoint', async () => {
    const provider = await providerOpenCodeGo.createProvider(config)
    if (!('chat' in provider))
      throw new Error('Expected a chat provider')
    expect(provider.chat('opencode-go/example-model')).toMatchObject({ model: 'example-model', baseURL: config.baseUrl })
    const models = await providerOpenCodeGo.extraMethods!.listModels!(config, provider, context)
    expect(models.length).toBeGreaterThan(0)
    expect(models.every(model => model.id.startsWith('opencode-go/') && model.provider === 'opencode-go')).toBe(true)
  })

  it.each([
    { status: 200, valid: true },
    { status: 400, valid: true },
    { status: 422, valid: true },
    { status: 401, valid: false },
    { status: 403, valid: false },
    { status: 503, valid: false },
  ])('classifies the non-generating credential probe response $status', async ({ status, valid }) => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status }))
    const factory = providerOpenCodeGo.validators!.validateProvider!.at(-1)!
    const validator = await factory(context)
    const provider = await providerOpenCodeGo.createProvider(config)
    const result = await validator.validator(config, provider, providerOpenCodeGo.extraMethods!, context)
    expect(result.valid).toBe(valid)
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[0][0].toString()).toBe('https://example.com/v1/chat/completions')
    expect(fetch.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer example-key' },
      body: expect.stringContaining('airi-credential-check-model-does-not-exist'),
    })
  })
})

import { afterEach, expect, it, vi } from 'vitest'

import { providerRuncrate } from './index'

afterEach(() => {
  vi.unstubAllGlobals()
})

// https://github.com/moeru-ai/airi/pull/3027#discussion_r4503040719
// ROOT CAUSE:
// Runcrate model discovery used global fetch, bypassing the selected transport during discovery and validation.
// The catalog request now uses the provider context's fetch implementation.
it.each(['discovery', 'validation'] as const)('uses the injected transport for Runcrate model %s (Issue #3027)', async (operation) => {
  const browserFetch = vi.fn<typeof fetch>().mockRejectedValue(new Error('Direct browser access is unavailable.'))
  vi.stubGlobal('fetch', browserFetch)
  const transportFetch = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({
    data: [{ id: 'chat-model', output_modalities: ['text'], context_length: 8192 }],
  }))
  const context = { t: (key: string) => key, fetch: transportFetch }
  const config = { baseUrl: 'https://example.com/v1/', apiKey: 'test-key' }
  const provider = await providerRuncrate.createProvider(config, context)

  if (operation === 'discovery') {
    const models = await providerRuncrate.extraMethods!.listModels!(config, provider, context)
    expect(models).toEqual([expect.objectContaining({ id: 'chat-model', provider: 'runcrate' })])
  }
  else {
    const validators = await Promise.all(providerRuncrate.validators!.validateProvider!.map(create => create(context)))
    const check = validators.find(validator => validator.id === 'openai-compatible:check-model-list')!
    const result = await check.validator(config, provider, providerRuncrate.extraMethods!, context)
    expect(result.valid).toBe(true)
  }

  expect(transportFetch).toHaveBeenCalledExactlyOnceWith('https://example.com/v1/models', {
    headers: { Authorization: 'Bearer test-key' },
  })
  expect(browserFetch).not.toHaveBeenCalled()
})

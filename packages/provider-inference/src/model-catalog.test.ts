import { openaiChatModels } from 'model-bank/openai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { listModelCatalog } from './model-catalog'

const route = { source: 'model-bank', models: openaiChatModels, providerId: 'openai', baseURL: 'https://api.openai.com/v1' } as const
const config = { apiKey: 'test-key', baseURL: route.baseURL }
const routerRoute = { source: 'openrouter', providerId: 'openrouter-ai', baseURL: 'https://openrouter.ai/api/v1/' } as const
const routerConfig = { apiKey: 'test-key', baseURL: routerRoute.baseURL }
let now = Date.now()

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  now += 2 * 60 * 60 * 1000
  vi.setSystemTime(now)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('route model catalogs', () => {
  it('uses the installed model-bank without a catalog request or model-name inference', async () => {
    const model = openaiChatModels.find(model => model.id === 'gpt-4.1')
    if (!model)
      throw new Error('Expected the installed OpenAI catalog to contain gpt-4.1')
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ data: [{ id: model.id }, { id: 'future-model-alias' }] }))
    vi.stubGlobal('fetch', fetch)
    const catalog = await listModelCatalog(config, route)
    expect(catalog.models.map(model => model.id)).toEqual(['gpt-4.1', 'future-model-alias'])
    expect(catalog.models[0]).toMatchObject({ name: model.displayName, contextLength: model.contextWindowTokens, metadata: {
      source: 'model-bank',
      abilities: model.abilities,
      pricing: model.pricing,
      settings: model.settings,
    } })
    expect(catalog.models[0].metadata).not.toHaveProperty('webSearch')
    expect(catalog.models[1].metadata).toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String(fetch.mock.calls[0][0])).toBe('https://api.openai.com/v1/models')
    expect(structuredClone(catalog)).toEqual(catalog)
  })

  it('does not apply official metadata to a custom endpoint', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ data: [{ id: 'gpt-4.1', name: 'Custom model', context_length: 42 }] }))
    vi.stubGlobal('fetch', fetch)
    const catalog = await listModelCatalog({ ...config, baseURL: 'https://custom.test/v1' }, route)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(catalog.models[0]).toMatchObject({ name: 'Custom model', contextLength: 42 })
    expect(catalog.models[0].metadata).toBeUndefined()
  })

  it('keeps OpenRouter route metadata separate and converts its price units', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ data: [{
      id: 'openai/future-model',
      name: 'Routed model',
      context_length: 321,
      supported_parameters: ['tools', 'web_search_options'],
      pricing: { prompt: '0.000001', completion: '0.000002' },
    }] }))
    vi.stubGlobal('fetch', fetch)
    const catalog = await listModelCatalog(routerConfig, routerRoute)
    expect(catalog.models[0]).toMatchObject({ contextLength: 321, metadata: { source: 'openrouter', supportedParameters: ['tools', 'web_search_options'], pricing: { input: 1, output: 2 } } })
    expect(catalog.models[0].metadata).not.toHaveProperty('webSearch')
    expect(fetch.mock.calls[1][1]).not.toHaveProperty('headers')
    expect(fetch.mock.calls[1][1]).toHaveProperty('credentials', 'omit')
  })

  it('keeps endpoint models on catalog failure and retries the next read', async () => {
    let reads = 0
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      if (init?.credentials !== 'omit')
        return Response.json({ data: [{ id: 'future-model' }] })
      reads++
      if (reads === 1)
        return new Response(null, { status: 503 })
      return Response.json({ data: [{ id: 'future-model', name: 'Recovered' }] })
    }))
    const failed = await listModelCatalog(routerConfig, routerRoute)
    expect(failed.models).toHaveLength(1)
    expect(failed.metadataError).toContain('503')
    const recovered = await listModelCatalog(routerConfig, routerRoute)
    expect(recovered.models[0].name).toBe('Recovered')
    expect(reads).toBe(2)
  })

  it('shares public snapshots across concurrent reads but always discovers endpoint models', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ data: [{ id: 'future-model', name: 'Future' }] }))
    vi.stubGlobal('fetch', fetch)
    const catalogs = await Promise.all([listModelCatalog(routerConfig, routerRoute), listModelCatalog(routerConfig, routerRoute)])
    expect(catalogs.every(catalog => catalog.models[0].metadata?.source === 'openrouter')).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})

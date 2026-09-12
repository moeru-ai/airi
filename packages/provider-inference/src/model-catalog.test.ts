import openRouterModels from 'model-bank/openrouter'

import { openaiChatModels } from 'model-bank/openai'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { listModelCatalog } from './model-catalog'

const route = { models: openaiChatModels, providerId: 'openai', baseURL: 'https://api.openai.com/v1' }
const config = { apiKey: 'test-key', baseURL: route.baseURL }

afterEach(() => vi.unstubAllGlobals())

describe('model-bank catalogs', () => {
  it('enriches exact discovered IDs without an additional catalog request', async () => {
    const model = openaiChatModels.find(model => model.id === 'gpt-4.1')
    if (!model)
      throw new Error('Expected gpt-4.1 in model-bank')
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ data: [{ id: model.id }, { id: 'future-model-alias' }] }))
    vi.stubGlobal('fetch', fetch)
    const catalog = await listModelCatalog(config, route)
    expect(catalog.models.map(model => model.id)).toEqual(['gpt-4.1', 'future-model-alias'])
    expect(catalog.models[0]).toMatchObject({ name: model.displayName, contextLength: model.contextWindowTokens, metadata: {
      abilities: model.abilities,
      pricing: model.pricing,
      settings: model.settings,
    } })
    expect(catalog.models[1].metadata).toBeUndefined()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String(fetch.mock.calls[0][0])).toBe('https://api.openai.com/v1/models')
    expect(structuredClone(catalog)).toEqual(catalog)
  })

  it('keeps custom endpoint metadata without applying the official catalog', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>(async () => Response.json({ data: [{ id: 'gpt-4.1', name: 'Custom model', context_length: 42 }] })))
    const catalog = await listModelCatalog({ ...config, baseURL: 'https://custom.test/v1' }, route)
    expect(catalog.models[0]).toMatchObject({ name: 'Custom model', contextLength: 42 })
    expect(catalog.models[0].metadata).toBeUndefined()
  })

  it('uses the OpenRouter model-bank catalog with one endpoint discovery request', async () => {
    const models = openRouterModels.filter(model => model.type === 'chat')
    const model = models[0]
    if (!model)
      throw new Error('Expected OpenRouter chat models in model-bank')
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ data: [{ id: model.id }] }))
    vi.stubGlobal('fetch', fetch)
    const catalog = await listModelCatalog({ apiKey: 'test-key', baseURL: 'https://openrouter.ai/api/v1/' }, {
      models,
      providerId: 'openrouter-ai',
      baseURL: 'https://openrouter.ai/api/v1/',
    })
    expect(catalog.models[0]).toMatchObject({ name: model.displayName ?? model.id, metadata: { abilities: model.abilities, pricing: model.pricing } })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

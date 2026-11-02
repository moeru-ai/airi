import type { ChatProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import type { ChatRequestOptions } from '../../../types'

import { generateText } from '@xsai/generate-text'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerOpenRouterAI } from './index'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('providerOpenRouterAI', () => {
  async function readCatalog(config: { apiKey: string, baseUrl?: string }) {
    return providerOpenRouterAI.extraMethods!.listModelCatalog!(config, await providerOpenRouterAI.createProvider(config))
  }

  it('shows the exact current gateway routes with Flash first, preserving other providers', async () => {
    const ids = ['openai/gpt-test', 'minimax/minimax-m2.7', 'minimax/minimax-m3', 'minimax/minimax-m3.1-flash:free', 'minimax/minimax-m3.1-flash', 'minimax/minimax-01', 'other/model']
    vi.stubGlobal('fetch', async () => Response.json({ data: ids.map(id => ({ id, object: 'model' })) }))
    const catalog = await readCatalog({ apiKey: 'test-key' })

    expect(catalog.models.map(model => model.id)).toEqual(['openai/gpt-test', 'minimax/minimax-m3.1-flash:free', 'minimax/minimax-m3', 'other/model'])
    expect(catalog.models[1].reasoning).toMatchObject({ supported: true, mandatory: true })
  })

  it('preserves custom endpoint discovery', async () => {
    const ids = ['minimax/minimax-m2.7', 'custom/model']
    vi.stubGlobal('fetch', async () => Response.json({ data: ids.map(id => ({ id, object: 'model' })) }))
    const catalog = await readCatalog({ apiKey: 'test-key', baseUrl: 'https://custom.example/v1/' })
    expect(catalog.models.map(model => model.id)).toEqual(ids)
  })

  it('preserves reasoning controls on a custom endpoint using the same model ID', async () => {
    const provider = await providerOpenRouterAI.createProvider({ apiKey: 'test-key', baseUrl: 'https://custom.example/v1/' }) as ChatProviderWithExtraOptions<string, ChatRequestOptions>
    expect(provider.chat('minimax/minimax-m3.1-flash:free', { reasoning: 'disabled' })).toMatchObject({
      baseURL: 'https://custom.example/v1/',
      reasoning: { effort: 'none' },
    })
  })

  it.each([
    { model: 'minimax/minimax-m3.1-flash:free', mode: 'disabled' as const, effort: undefined },
    { model: 'minimax/minimax-m3.1-flash:free', mode: 'enabled' as const, effort: 'medium' },
    { model: 'minimax/minimax-m3', mode: 'disabled' as const, effort: 'none' },
    { model: 'minimax/minimax-m2.7', mode: 'disabled' as const, effort: 'none' },
    { model: 'custom/model', mode: 'enabled' as const, effort: 'medium' },
  ])('serializes $model with reasoning $mode', async ({ model, mode, effort }) => {
    const requests: Request[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init))
      return Response.json({
        choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })
    })
    const provider = await providerOpenRouterAI.createProvider({ apiKey: 'test-key' }) as ChatProviderWithExtraOptions<string, ChatRequestOptions>
    await generateText({ ...provider.chat(model, { reasoning: mode }), messages: [{ role: 'user', content: 'ping' }] })

    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(requests[0].headers.get('authorization')).toBe('Bearer test-key')
    expect(requests[0].headers.get('HTTP-Referer')).toBe('https://airi.moeru.ai/')
    expect(requests[0].headers.get('X-OpenRouter-Title')).toBe('Project AIRI')
    const body = await requests[0].json()
    expect(body.model).toBe(model)
    if (effort)
      expect(body.reasoning).toEqual({ effort })
    else
      expect(body).not.toHaveProperty('reasoning')
    expect(body).not.toHaveProperty('reasoning_effort')
    expect(body).not.toHaveProperty('max_tokens')
    expect(body).not.toHaveProperty('max_completion_tokens')
    expect(body).not.toHaveProperty('modalities')
  })

  it('maps AIRI reasoning modes to OpenRouter request fields', async () => {
    const provider = await providerOpenRouterAI.createProvider({
      apiKey: 'test-key',
    }) as ChatProviderWithExtraOptions<string, ChatRequestOptions>

    expect(provider.chat('openai/gpt-test', { reasoning: 'disabled' })).toMatchObject({
      reasoning: { effort: 'none' },
    })
    expect(provider.chat('openai/gpt-test', { reasoning: 'enabled' })).toMatchObject({
      reasoning: { effort: 'medium' },
    })
  })
})

import type { ChatProvider } from '@xsai-ext/providers/utils'

import { generateText } from '@xsai/generate-text'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerMinimax, providerMinimaxGlobal } from './index'

const discoveredIds = ['MiniMax-M2.7', 'MiniMax-M3', 'MiniMax-M3.1-Flash', 'MiniMax-M3.1', 'M2-her', 'MiniMax-Text-01', 'abab6.5s-chat']

function mockModels(ids = discoveredIds) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ data: ids.map(id => ({ id, object: 'model' })) }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each([
  { name: 'CN', definition: providerMinimax, baseURL: 'https://api.minimaxi.com/v1/' },
  { name: 'global', definition: providerMinimaxGlobal, baseURL: 'https://api.minimax.io/v1/' },
])('minimax $name', ({ definition, baseURL }) => {
  async function readModels(config: { apiKey: string, baseUrl?: string }) {
    return definition.extraMethods!.listModels!(config, await definition.createProvider(config))
  }

  it('offers only discovered current text models, with Flash first', async () => {
    const fetch = mockModels()
    const models = await readModels({ apiKey: 'test-key' })

    expect(models.map(model => model.id)).toEqual(['MiniMax-M3.1-Flash', 'MiniMax-M3'])
    expect(String(fetch.mock.calls[0]?.[0])).toBe(`${baseURL}models`)
  })

  it('reports discovery errors instead of silently returning an empty catalog', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('discovery failed')
    })
    await expect(readModels({ apiKey: 'test-key' })).rejects.toThrow('discovery failed')
  })

  it('does not invent Flash when discovery only returns M3', async () => {
    mockModels(['MiniMax-M2.7', 'MiniMax-M3'])
    const models = await readModels({ apiKey: 'test-key' })
    expect(models.map(model => model.id)).toEqual(['MiniMax-M3'])
  })

  it('preserves a custom endpoint catalog and order', async () => {
    const fetch = mockModels(['MiniMax-M2.7', 'private-model', 'MiniMax-M3'])
    const models = await readModels({ apiKey: 'test-key', baseUrl: 'https://custom.example/v1/' })
    expect(models.map(model => model.id)).toEqual(['MiniMax-M2.7', 'private-model', 'MiniMax-M3'])
    expect(String(fetch.mock.calls[0]?.[0])).toBe('https://custom.example/v1/models')
  })

  it('does not filter non-text models from discovery', async () => {
    mockModels(['speech-2.8-hd', 'MiniMax-M2.7', 'MiniMax-M3', 'MiniMax-M3.1-Flash', 'image-01'])
    const models = await readModels({ apiKey: 'test-key' })
    expect(models.map(model => model.id)).toEqual(['speech-2.8-hd', 'MiniMax-M3.1-Flash', 'MiniMax-M3', 'image-01'])
  })

  it.each(['MiniMax-M3.1-Flash', 'MiniMax-M3', 'MiniMax-M2.7', 'private-model'])('serializes %s without rewriting saved or custom selections', async (model) => {
    const requests: Request[] = []
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init))
      return Response.json({
        choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })
    })
    const provider = await definition.createProvider({ apiKey: 'test-key' }) as ChatProvider
    await generateText({
      ...provider.chat(model),
      messages: [{ role: 'user', content: [{ type: 'text', text: 'ping' }, { type: 'image_url', image_url: { url: 'https://example.com/image.png' } }] }],
    })

    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe(`${baseURL}chat/completions`)
    expect(requests[0].headers.get('authorization')).toBe('Bearer test-key')
    const body = await requests[0].json()
    expect(body.model).toBe(model)
    expect(body.messages[0].content).toEqual([{ type: 'text', text: 'ping' }, { type: 'image_url', image_url: { url: 'https://example.com/image.png' } }])
    expect(body).not.toHaveProperty('reasoning_effort')
    expect(body).not.toHaveProperty('reasoning')
    expect(body).not.toHaveProperty('max_tokens')
    expect(body).not.toHaveProperty('max_completion_tokens')
    expect(body).not.toHaveProperty('modalities')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'

import { getDefinedProvider } from '../../../index'
import { providerWiroAI } from './index'

const config = { apiKey: 'test-key', baseUrl: 'https://llm.wiro.ai/v1/' }

afterEach(() => vi.unstubAllGlobals())

describe('wiro ai provider', () => {
  it('is registered under its provider id', () => {
    expect(getDefinedProvider('wiro-ai')).toBe(providerWiroAI)
  })

  it('lists the gateway models and marks image input as vision', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ data: [
      {
        id: 'openai/gpt-5-4-nano',
        name: 'GPT-5.4 Nano',
        description: 'A small OpenAI model for text and image input.',
        context_length: 400000,
        architecture: { input_modalities: ['text', 'image', 'file'], output_modalities: ['text'] },
      },
      {
        id: 'deepseek/v4-flash',
        context_length: 1048576,
        architecture: { input_modalities: ['text'], output_modalities: ['text'] },
      },
    ] }))
    vi.stubGlobal('fetch', fetch)

    const provider = await providerWiroAI.createProvider(config)
    const models = await providerWiroAI.extraMethods!.listModels!(config, provider)

    expect(models).toEqual([
      {
        id: 'openai/gpt-5-4-nano',
        name: 'GPT-5.4 Nano',
        provider: 'wiro-ai',
        description: 'A small OpenAI model for text and image input.',
        inputModalities: ['text', 'image', 'file'],
        contextLength: 400000,
        metadata: { abilities: { vision: true } },
      },
      {
        id: 'deepseek/v4-flash',
        name: 'deepseek/v4-flash',
        provider: 'wiro-ai',
        inputModalities: ['text'],
        contextLength: 1048576,
      },
    ])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(String(fetch.mock.calls[0][0])).toBe('https://llm.wiro.ai/v1/models')
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer test-key')
  })
})

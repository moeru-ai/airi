import type { ChatProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import type { ChatRequestOptions, ProviderInstance } from '../../../types'

import { generateText } from '@xsai/generate-text'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerChutesAI } from './index'

type ChutesChatProvider = ChatProviderWithExtraOptions<string, ChatRequestOptions>

function isChutesChatProvider(provider: ProviderInstance): provider is ChutesChatProvider {
  return 'chat' in provider && typeof provider.chat === 'function'
}

async function createChutesChatProvider(): Promise<ChutesChatProvider> {
  const provider = await providerChutesAI.createProvider({ apiKey: 'cpk_test', baseUrl: 'https://llm.chutes.ai/v1/' })
  if (!isChutesChatProvider(provider))
    throw new Error('Chutes provider must support chat')

  return provider
}

/** Entries copied from the public `GET https://llm.chutes.ai/v1/models` response, trimmed to the parsed fields. */
const chutesModels = [
  {
    id: 'Qwen/Qwen3.6-27B-TEE',
    object: 'model',
    context_length: 262144,
    max_output_length: 65536,
    input_modalities: ['text', 'image'],
    supported_features: ['json_mode', 'tools', 'structured_outputs', 'reasoning'],
    pricing: { prompt: 0.3, completion: 2, input_cache_read: 0.03 },
  },
  {
    id: 'unsloth/Mistral-Nemo-Instruct-2407-TEE',
    object: 'model',
    pricing: { prompt: 0.0245, completion: 0.0978 },
  },
  {
    id: 'Nemotron-3-Nano-Omni-30B-TEE',
    object: 'model',
  },
]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('providerChutesAI chat options', () => {
  it('does not send template switches without a reasoning request', async () => {
    const provider = await createChutesChatProvider()

    expect(provider.chat('Qwen/Qwen3.6-27B-TEE')).not.toHaveProperty('chatTemplateKwargs')
  })

  it('sends both hybrid thinking switches when reasoning is disabled', async () => {
    const provider = await createChutesChatProvider()

    expect(provider.chat('Qwen/Qwen3.6-27B-TEE', { reasoning: 'disabled' })).toMatchObject({
      chatTemplateKwargs: { enable_thinking: false, thinking: false },
    })
  })

  it('serializes the template switches as chat_template_kwargs on the wire', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 0,
      model: 'Qwen/Qwen3.6-27B-TEE',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: 'pong' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }))
    vi.stubGlobal('fetch', fetch)
    const provider = await createChutesChatProvider()

    await generateText({
      ...provider.chat('Qwen/Qwen3.6-27B-TEE', { reasoning: 'enabled' }),
      messages: [{ role: 'user', content: 'ping' }],
    })

    const [url, init] = fetch.mock.calls[0]
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(String(url)).toBe('https://llm.chutes.ai/v1/chat/completions')
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer cpk_test')
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: true, thinking: true })
  })
})

describe('providerChutesAI.extraMethods.listModels', () => {
  it('maps Chutes modalities, features, and pricing into model metadata', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({ object: 'list', data: chutesModels }))
    vi.stubGlobal('fetch', fetch)
    const config = { apiKey: 'cpk_test', baseUrl: 'https://llm.chutes.ai/v1/' }
    const provider = await providerChutesAI.createProvider(config)

    const models = await providerChutesAI.extraMethods!.listModels!(config, provider)

    expect(String(fetch.mock.calls[0][0])).toBe('https://llm.chutes.ai/v1/models')
    expect(models[0]).toEqual({
      id: 'Qwen/Qwen3.6-27B-TEE',
      name: 'Qwen/Qwen3.6-27B-TEE',
      provider: 'chutes-ai',
      contextLength: 262144,
      metadata: {
        abilities: { vision: true, video: false, functionCall: true, reasoning: true, structuredOutput: true },
        maxOutput: 65536,
        pricing: {
          currency: 'USD',
          units: [
            { name: 'textInput', rate: 0.3, strategy: 'fixed', unit: 'millionTokens' },
            { name: 'textOutput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
            { name: 'textInput_cacheRead', rate: 0.03, strategy: 'fixed', unit: 'millionTokens' },
          ],
        },
      },
    })
  })

  it('reports no abilities for legacy chutes that omit capability fields', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>(async () => Response.json({ object: 'list', data: chutesModels })))
    const config = { apiKey: 'cpk_test' }
    const provider = await providerChutesAI.createProvider(config)

    const models = await providerChutesAI.extraMethods!.listModels!(config, provider)

    expect(models[1].metadata).not.toHaveProperty('abilities')
    expect(models[1].metadata?.pricing?.units).toHaveLength(2)
    expect(models[2]).toEqual({ id: 'Nemotron-3-Nano-Omni-30B-TEE', name: 'Nemotron-3-Nano-Omni-30B-TEE', provider: 'chutes-ai' })
  })
})

import type { ChatProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import type { ChatRequestOptions } from '../../../types'

import { describe, expect, it } from 'vitest'

import { providerOpenRouterAI } from './index'

describe('providerOpenRouterAI', () => {
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

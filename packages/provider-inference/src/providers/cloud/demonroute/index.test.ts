import type {
  ChatProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'

import type { ChatRequestOptions, ProviderInstance } from '../../../types'

import { describe, expect, it } from 'vitest'

import { getDefinedProvider } from '../../../index'
import { DEMONROUTE_DEFAULT_BASE_URL, providerDemonRoute } from './index'

type DemonRouteChatProvider = ChatProviderWithExtraOptions<string, ChatRequestOptions>

function isDemonRouteChatProvider(provider: ProviderInstance): provider is DemonRouteChatProvider {
  return 'chat' in provider && typeof provider.chat === 'function'
}

describe('demonroute provider', () => {
  it('is registered with the DemonRoute endpoint as default', () => {
    expect(getDefinedProvider('demonroute')).toBe(providerDemonRoute)
    expect(DEMONROUTE_DEFAULT_BASE_URL).toBe('https://api.demonroute.com/v1/')
  })

  it('has default configuration and capabilities', () => {
    expect(providerDemonRoute.id).toBe('demonroute')
    expect(providerDemonRoute.name).toBe('DemonRoute')
    expect(providerDemonRoute.description).toBe('demonroute.com')
    expect(providerDemonRoute.tasks).toEqual(['chat'])
    expect(providerDemonRoute.capabilities).toEqual({
      chat: {
        reasoning: {
          modes: ['enabled', 'disabled'],
        },
      },
    })
  })

  it('creates provider with default baseUrl and handles reasoning options', async () => {
    const instance = await providerDemonRoute.createProvider({
      apiKey: 'dr-test-key',
    })

    if (!isDemonRouteChatProvider(instance))
      throw new Error('DemonRoute provider must support chat')

    const chatDefault = instance.chat('test-model')
    expect(chatDefault).toBeDefined()
    expect(chatDefault).not.toHaveProperty('chatTemplateKwargs')

    const chatReasoningEnabled = instance.chat('test-model', { reasoning: 'enabled' })
    expect(chatReasoningEnabled).toMatchObject({
      chatTemplateKwargs: { enable_thinking: true },
    })

    const chatReasoningDisabled = instance.chat('test-model', { reasoning: 'disabled' })
    expect(chatReasoningDisabled).toMatchObject({
      chatTemplateKwargs: { enable_thinking: false },
    })
  })

  it('validates apiKey is required for validation', () => {
    expect(providerDemonRoute.validationRequiredWhen?.({ apiKey: '' })).toBe(false)
    expect(providerDemonRoute.validationRequiredWhen?.({ apiKey: '  ' })).toBe(false)
    expect(providerDemonRoute.validationRequiredWhen?.({ apiKey: 'dr-valid' })).toBe(true)
  })
})

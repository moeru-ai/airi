import type {
  ChatProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'

import type { ChatRequestOptions, ProviderInstance } from '../../../types'

import { describe, expect, it } from 'vitest'

import { providerDeepSeek } from './index'

type DeepSeekChatProvider = ChatProviderWithExtraOptions<string, ChatRequestOptions>

function isDeepSeekChatProvider(provider: ProviderInstance): provider is DeepSeekChatProvider {
  return 'chat' in provider && typeof provider.chat === 'function'
}

async function createDeepSeekChatProvider(
  thinkingMode: 'auto' | 'disable' | 'enable',
): Promise<DeepSeekChatProvider> {
  const provider = await providerDeepSeek.createProvider({
    apiKey: 'sk-test',
    baseUrl: 'https://api.deepseek.com/',
    thinkingMode,
  })

  if (!isDeepSeekChatProvider(provider))
    throw new Error('DeepSeek provider must support chat')

  return provider
}

describe('providerDeepSeek.createProvider chat options', () => {
  it('should not set thinking when thinkingMode is auto', async () => {
    const provider = await createDeepSeekChatProvider('auto')

    expect(provider.chat('deepseek-chat')).not.toHaveProperty('thinking')
  })

  it('should set thinking disabled when thinkingMode is disable', async () => {
    const provider = await createDeepSeekChatProvider('disable')

    expect(provider.chat('deepseek-chat')).toMatchObject({
      thinking: { type: 'disabled' },
    })
  })

  it('should set thinking enabled when thinkingMode is enable', async () => {
    const provider = await createDeepSeekChatProvider('enable')

    expect(provider.chat('deepseek-chat')).toMatchObject({
      thinking: { type: 'enabled' },
    })
  })

  it('should prioritize request reasoning over the provider setting', async () => {
    const provider = await createDeepSeekChatProvider('enable')

    expect(provider.chat('deepseek-chat', { reasoning: 'disabled' })).toMatchObject({
      thinking: { type: 'disabled' },
    })
  })
})

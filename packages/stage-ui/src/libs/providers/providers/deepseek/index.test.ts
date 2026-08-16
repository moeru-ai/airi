import type {
  ChatProvider,
  ChatProviderWithExtraOptions,
} from '@xsai-ext/providers/utils'

import type { ProviderInstance } from '../../types'

import { describe, expect, it } from 'vitest'

import { providerDeepSeek } from './index'

type DeepSeekChatProvider = ChatProvider | ChatProviderWithExtraOptions

function isDeepSeekChatProvider(provider: ProviderInstance): provider is DeepSeekChatProvider {
  return 'chat' in provider && typeof provider.chat === 'function'
}

function createDeepSeekChatProvider(
  thinkingMode: 'auto' | 'disable' | 'enable',
): DeepSeekChatProvider {
  const provider = providerDeepSeek.createProvider({
    apiKey: 'sk-test',
    baseUrl: 'https://api.deepseek.com/',
    thinkingMode,
  })

  if (!isDeepSeekChatProvider(provider))
    throw new Error('DeepSeek provider must support chat')

  return provider
}

describe('providerDeepSeek.createProvider chat options', () => {
  it('should not set thinking when thinkingMode is auto', () => {
    const provider = createDeepSeekChatProvider('auto')

    expect(provider.chat('deepseek-chat')).not.toHaveProperty('thinking')
  })

  it('should set thinking disabled when thinkingMode is disable', () => {
    const provider = createDeepSeekChatProvider('disable')

    expect(provider.chat('deepseek-chat')).toMatchObject({
      thinking: { type: 'disabled' },
    })
  })

  it('should set thinking enabled when thinkingMode is enable', () => {
    const provider = createDeepSeekChatProvider('enable')

    expect(provider.chat('deepseek-chat')).toMatchObject({
      thinking: { type: 'enabled' },
    })
  })
})

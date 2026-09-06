import type { ChatProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import type { ChatRequestOptions, ProviderInstance } from '../../../types'

import { describe, expect, it } from 'vitest'

import { providerOllama, resolveOllamaReasoningEffort } from './index'

type OllamaChatProvider = ChatProviderWithExtraOptions<string, ChatRequestOptions>

function isOllamaChatProvider(provider: ProviderInstance): provider is OllamaChatProvider {
  return 'chat' in provider && typeof provider.chat === 'function'
}

async function createOllamaChatProvider(thinkingMode: 'auto' | 'disable' | 'enable'): Promise<OllamaChatProvider> {
  const provider = await providerOllama.createProvider({
    baseUrl: 'http://localhost:11434/v1/',
    thinkingMode,
  })
  if (!isOllamaChatProvider(provider))
    throw new Error('Ollama provider must support chat')

  return provider
}

describe('providerOllama.resolveOllamaReasoningEffort', () => {
  it('should return undefined for auto mode', () => {
    expect(resolveOllamaReasoningEffort('auto')).toBeUndefined()
  })

  it('should map disable/enable to OpenAI-compatible effort values', () => {
    expect(resolveOllamaReasoningEffort('disable')).toBe('none')
    expect(resolveOllamaReasoningEffort('enable')).toBe('medium')
  })

  it('should pass level modes through unchanged', () => {
    expect(resolveOllamaReasoningEffort('low')).toBe('low')
    expect(resolveOllamaReasoningEffort('medium')).toBe('medium')
    expect(resolveOllamaReasoningEffort('high')).toBe('high')
  })

  it('should fallback invalid values to auto mode', () => {
    expect(resolveOllamaReasoningEffort('invalid')).toBeUndefined()
  })
})

describe('providerOllama.createProvider chat options', () => {
  it('should not set reasoning effort when thinkingMode is auto', async () => {
    const provider = await createOllamaChatProvider('auto')

    expect(provider.chat('qwen3:8b')).not.toHaveProperty('reasoningEffort')
  })

  it('should set reasoning effort to none for non gpt-oss when thinkingMode is disable', async () => {
    const provider = await createOllamaChatProvider('disable')

    expect(provider.chat('qwen3:8b')).toMatchObject({ reasoningEffort: 'none' })
  })

  it('should set reasoning effort to medium when thinkingMode is enable', async () => {
    const provider = await createOllamaChatProvider('enable')

    expect(provider.chat('gpt-oss:20b')).toMatchObject({ reasoningEffort: 'medium' })
  })

  it('should set reasoning effort to none when thinkingMode is disable', async () => {
    const provider = await createOllamaChatProvider('disable')

    expect(provider.chat('gpt-oss:20b')).toMatchObject({ reasoningEffort: 'none' })
  })

  it('should apply request reasoning without checking the model name', async () => {
    const provider = await createOllamaChatProvider('auto')

    expect(provider.chat('llama3.2', { reasoning: 'disabled' })).toMatchObject({ reasoningEffort: 'none' })
    expect(provider.chat('gpt-oss:20b', { reasoning: 'enabled' })).toMatchObject({ reasoningEffort: 'medium' })
  })
})

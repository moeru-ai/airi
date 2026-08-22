import { describe, expect, it } from 'vitest'

import { providerOllama, resolveOllamaReasoningEffort } from './index'

describe('providerOllama.resolveOllamaReasoningEffort', () => {
  it('should return undefined for auto mode', () => {
    expect(resolveOllamaReasoningEffort('qwen3:8b', 'auto')).toBeUndefined()
  })

  it('should map disable/enable to OpenAI-compatible effort values', () => {
    expect(resolveOllamaReasoningEffort('qwen3:8b', 'disable')).toBe('none')
    expect(resolveOllamaReasoningEffort('qwen3:8b', 'enable')).toBe('medium')
  })

  it('should map disable/enable to levels for gpt-oss models', () => {
    expect(resolveOllamaReasoningEffort('gpt-oss:20b', 'disable')).toBe('low')
    expect(resolveOllamaReasoningEffort('gpt-oss:20b', 'enable')).toBe('medium')
  })

  it('should pass level modes through unchanged', () => {
    expect(resolveOllamaReasoningEffort('qwen3:8b', 'low')).toBe('low')
    expect(resolveOllamaReasoningEffort('qwen3:8b', 'medium')).toBe('medium')
    expect(resolveOllamaReasoningEffort('qwen3:8b', 'high')).toBe('high')
  })

  it('should fallback invalid values to auto mode', () => {
    expect(resolveOllamaReasoningEffort('qwen3:8b', 'invalid')).toBeUndefined()
  })
})

describe('providerOllama.createProvider chat options', () => {
  it('should not set reasoning effort when thinkingMode is auto', () => {
    const provider = providerOllama.createProvider({
      baseUrl: 'http://localhost:11434/v1/',
      thinkingMode: 'auto',
    })
    if (!('chat' in provider))
      throw new Error('Ollama did not create a chat provider.')

    expect(provider.chat('qwen3:8b')).not.toHaveProperty('reasoningEffort')
  })

  it('should set reasoning effort to none for non gpt-oss when thinkingMode is disable', () => {
    const provider = providerOllama.createProvider({
      baseUrl: 'http://localhost:11434/v1/',
      thinkingMode: 'disable',
    })
    if (!('chat' in provider))
      throw new Error('Ollama did not create a chat provider.')

    expect(provider.chat('qwen3:8b')).toMatchObject({ reasoningEffort: 'none' })
  })

  it('should set reasoning effort to medium for gpt-oss when thinkingMode is enable', () => {
    const provider = providerOllama.createProvider({
      baseUrl: 'http://localhost:11434/v1/',
      thinkingMode: 'enable',
    })
    if (!('chat' in provider))
      throw new Error('Ollama did not create a chat provider.')

    expect(provider.chat('gpt-oss:20b')).toMatchObject({ reasoningEffort: 'medium' })
  })

  it('should set reasoning effort to low for gpt-oss when thinkingMode is disable', () => {
    const provider = providerOllama.createProvider({
      baseUrl: 'http://localhost:11434/v1/',
      thinkingMode: 'disable',
    })
    if (!('chat' in provider))
      throw new Error('Ollama did not create a chat provider.')

    expect(provider.chat('gpt-oss:20b')).toMatchObject({ reasoningEffort: 'low' })
  })
})

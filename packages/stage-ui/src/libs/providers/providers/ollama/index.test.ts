import { describe, expect, it } from 'vitest'

import { providerOllama, resolveOllamaThink } from './index'

describe('providerOllama.resolveOllamaThink', () => {
  it('should return undefined for auto mode', () => {
    expect(resolveOllamaThink('qwen3:8b', 'auto')).toBeUndefined()
  })

  it('should map disable/enable to booleans for non gpt-oss models', () => {
    expect(resolveOllamaThink('qwen3:8b', 'disable')).toBe(false)
    expect(resolveOllamaThink('qwen3:8b', 'enable')).toBe(true)
  })

  it('should map disable/enable to levels for gpt-oss models', () => {
    expect(resolveOllamaThink('gpt-oss:20b', 'disable')).toBe('low')
    expect(resolveOllamaThink('gpt-oss:20b', 'enable')).toBe('medium')
  })

  it('should pass level modes through unchanged', () => {
    expect(resolveOllamaThink('qwen3:8b', 'low')).toBe('low')
    expect(resolveOllamaThink('qwen3:8b', 'medium')).toBe('medium')
    expect(resolveOllamaThink('qwen3:8b', 'high')).toBe('high')
  })

  it('should fallback invalid values to auto mode', () => {
    expect(resolveOllamaThink('qwen3:8b', 'invalid')).toBeUndefined()
  })
})

describe('providerOllama.createProvider chat options', () => {
  it('should not set think when thinkingMode is auto', () => {
    const provider = providerOllama.createProvider({
      baseUrl: 'http://localhost:11434/v1/',
      thinkingMode: 'auto',
    }) as any

    const chatOptions = provider.chat('qwen3:8b') as Record<string, unknown>
    expect('think' in chatOptions).toBe(false)
  })

  it('should set think=false for non gpt-oss when thinkingMode is disable', () => {
    const provider = providerOllama.createProvider({
      baseUrl: 'http://localhost:11434/v1/',
      thinkingMode: 'disable',
    }) as any

    const chatOptions = provider.chat('qwen3:8b') as Record<string, unknown>
    expect(chatOptions.think).toBe(false)
  })

  it('should set think=medium for gpt-oss when thinkingMode is enable', () => {
    const provider = providerOllama.createProvider({
      baseUrl: 'http://localhost:11434/v1/',
      thinkingMode: 'enable',
    }) as any

    const chatOptions = provider.chat('gpt-oss:20b') as Record<string, unknown>
    expect(chatOptions.think).toBe('medium')
  })

  it('should set think=low for gpt-oss when thinkingMode is disable', () => {
    const provider = providerOllama.createProvider({
      baseUrl: 'http://localhost:11434/v1/',
      thinkingMode: 'disable',
    }) as any

    const chatOptions = provider.chat('gpt-oss:20b') as Record<string, unknown>
    expect(chatOptions.think).toBe('low')
  })
})

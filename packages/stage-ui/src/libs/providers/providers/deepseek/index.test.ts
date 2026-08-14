import { describe, expect, it } from 'vitest'

import { providerDeepSeek, resolveDeepSeekThinking } from './index'

describe('providerDeepSeek.resolveDeepSeekThinking', () => {
  it('should return undefined for auto mode', () => {
    expect(resolveDeepSeekThinking('auto')).toBeUndefined()
  })

  it('should map disable and enable to DeepSeek thinking options', () => {
    expect(resolveDeepSeekThinking('disable')).toEqual({ type: 'disabled' })
    expect(resolveDeepSeekThinking('enable')).toEqual({ type: 'enabled' })
  })

  it('should fallback invalid values to auto mode', () => {
    expect(resolveDeepSeekThinking('invalid')).toBeUndefined()
  })
})

describe('providerDeepSeek.createProvider chat options', () => {
  it('should not set thinking when thinkingMode is auto', () => {
    const provider = providerDeepSeek.createProvider({
      apiKey: 'sk-test',
      baseUrl: 'https://api.deepseek.com/',
      thinkingMode: 'auto',
    }) as any

    const chatOptions = provider.chat('deepseek-chat') as Record<string, unknown>
    expect('thinking' in chatOptions).toBe(false)
  })

  it('should set thinking disabled when thinkingMode is disable', () => {
    const provider = providerDeepSeek.createProvider({
      apiKey: 'sk-test',
      baseUrl: 'https://api.deepseek.com/',
      thinkingMode: 'disable',
    }) as any

    const chatOptions = provider.chat('deepseek-chat') as Record<string, unknown>
    expect(chatOptions.thinking).toEqual({ type: 'disabled' })
  })

  it('should set thinking enabled when thinkingMode is enable', () => {
    const provider = providerDeepSeek.createProvider({
      apiKey: 'sk-test',
      baseUrl: 'https://api.deepseek.com/',
      thinkingMode: 'enable',
    }) as any

    const chatOptions = provider.chat('deepseek-chat') as Record<string, unknown>
    expect(chatOptions.thinking).toEqual({ type: 'enabled' })
  })
})

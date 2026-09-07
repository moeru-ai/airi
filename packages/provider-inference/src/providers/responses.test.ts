import type { GenerationProvider } from '../types'

import { describe, expect, it } from 'vitest'

import { providerOpenAI } from './cloud/openai'
import { providerOpenAICompatible } from './cloud/openai-compatible'

describe('responses provider selection', () => {
  it('keeps Chat Completions as the configured default', async () => {
    const provider = await providerOpenAI.createProvider({ apiKey: 'test' }) as GenerationProvider
    expect(provider.responses).toBeUndefined()
    expect(provider.chat?.('test-model').model).toBe('test-model')
  })

  it('selects Responses and keeps reasoning in its native request field', async () => {
    const provider = await providerOpenAI.createProvider({ apiKey: 'test', api: 'responses' }) as GenerationProvider
    expect(provider.responses?.('test-model', { reasoning: 'enabled' })).toMatchObject({ model: 'test-model', reasoning: { effort: 'medium', summary: 'auto' } })
    expect(provider.responses?.('test-model', { reasoning: 'disabled' }).reasoning).toEqual({ effort: 'none' })
  })

  it('uses a custom Responses base URL without embedding the endpoint in configuration', async () => {
    const provider = await providerOpenAICompatible.createProvider({ api: 'responses', baseUrl: 'https://custom.test/v1' }) as GenerationProvider
    expect(String(provider.responses?.('custom').baseURL)).toBe('https://custom.test/v1')
  })
})

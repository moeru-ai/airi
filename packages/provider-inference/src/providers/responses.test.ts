import { describe, expect, it } from 'vitest'

import { isGenerationProvider, resolveGeneration } from '../types'
import { providerOpenAI } from './cloud/openai'
import { providerOpenAICompatible } from './cloud/openai-compatible'

describe('generation selection', () => {
  it('defaults OpenAI to Responses with search for supported models', async () => {
    const provider = await providerOpenAI.createProvider({ apiKey: 'test' })
    if (!isGenerationProvider(provider))
      throw new Error('Expected generation')
    expect(resolveGeneration(provider, 'gpt-4.1')).toMatchObject({ protocol: 'responses', webSearch: true })
    expect(resolveGeneration(provider, 'custom-model')).toMatchObject({ protocol: 'responses', webSearch: false })
  })

  it('honors an explicit Chat Completions choice', async () => {
    const provider = await providerOpenAI.createProvider({ apiKey: 'test', api: 'chat-completions' })
    if (!isGenerationProvider(provider))
      throw new Error('Expected generation')
    expect(resolveGeneration(provider, 'gpt-4.1').protocol).toBe('chat-completions')
  })

  it('honors search off and does not infer search for custom endpoints', async () => {
    for (const config of [{ webSearch: false }, { baseUrl: 'https://custom.test/v1' }]) {
      const provider = await providerOpenAI.createProvider({ apiKey: 'test', ...config })
      if (!isGenerationProvider(provider))
        throw new Error('Expected generation')
      expect(resolveGeneration(provider, 'gpt-4.1')).toMatchObject({ protocol: 'responses', webSearch: false })
    }
  })

  it('keeps compatible endpoints on Chat unless the user selects Responses', async () => {
    for (const api of ['chat-completions', 'responses'] as const) {
      const provider = await providerOpenAICompatible.createProvider({ api, baseUrl: 'https://custom.test/v1' })
      if (!isGenerationProvider(provider))
        throw new Error('Expected generation')
      expect(resolveGeneration(provider, 'custom')).toMatchObject({ protocol: api, config: { baseURL: 'https://custom.test/v1' } })
    }
  })

  it('places reasoning in the selected protocol configuration', async () => {
    const provider = await providerOpenAI.createProvider({ apiKey: 'test' })
    if (!isGenerationProvider(provider))
      throw new Error('Expected generation')
    expect(resolveGeneration(provider, 'gpt-5', { reasoning: 'enabled' })).toMatchObject({ config: { reasoning: { effort: 'medium', summary: 'auto' } } })
  })
})

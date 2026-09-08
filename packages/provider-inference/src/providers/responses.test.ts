import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { getGenerationProvider, isGenerationProvider } from '../types'
import { providerOpenAI } from './cloud/openai'
import { providerOpenAICompatible } from './cloud/openai-compatible'
import { providerOpenRouterAI } from './cloud/openrouter-ai'

describe('generation selection', () => {
  it('defaults OpenAI to Responses without inferring search from model names', async () => {
    const provider = await providerOpenAI.createProvider({ apiKey: 'test' })
    if (!isGenerationProvider(provider))
      throw new Error('Expected generation')
    expect(provider.generation('gpt-4.1')).toMatchObject({ protocol: 'responses', webSearch: false })
    expect(provider.generation('custom-model')).toMatchObject({ protocol: 'responses', webSearch: false })
  })

  it('honors explicit search without a model-name allowlist', async () => {
    const provider = await providerOpenAI.createProvider({ apiKey: 'test', webSearch: true })
    if (!isGenerationProvider(provider))
      throw new Error('Expected generation')
    expect(provider.generation('future-model')).toMatchObject({ protocol: 'responses', webSearch: true })
  })

  it('honors an explicit Chat Completions choice', async () => {
    const provider = await providerOpenAI.createProvider({ apiKey: 'test', api: 'chat-completions' })
    if (!isGenerationProvider(provider))
      throw new Error('Expected generation')
    expect(provider.generation('gpt-4.1').protocol).toBe('chat-completions')
  })

  it('honors search off and does not infer search for custom endpoints', async () => {
    for (const config of [{ webSearch: false }, { baseUrl: 'https://custom.test/v1', webSearch: true }]) {
      const provider = await providerOpenAI.createProvider({ apiKey: 'test', ...config })
      if (!isGenerationProvider(provider))
        throw new Error('Expected generation')
      expect(provider.generation('gpt-4.1')).toMatchObject({ protocol: 'responses', webSearch: false })
    }
  })

  it('keeps compatible endpoints on Chat unless the user selects Responses', async () => {
    for (const api of ['chat-completions', 'responses'] as const) {
      const provider = await providerOpenAICompatible.createProvider({ api, baseUrl: 'https://custom.test/v1' })
      if (!isGenerationProvider(provider))
        throw new Error('Expected generation')
      expect(provider.generation('custom')).toMatchObject({ protocol: api, config: { baseURL: 'https://custom.test/v1' } })
    }
  })

  it('places reasoning in the selected protocol configuration', async () => {
    const provider = await providerOpenAI.createProvider({ apiKey: 'test' })
    if (!isGenerationProvider(provider))
      throw new Error('Expected generation')
    expect(provider.generation('gpt-5', { reasoning: 'enabled' })).toMatchObject({ config: { reasoning: { effort: 'medium', summary: 'auto' } } })
  })
})

it('adapts existing SDK instances once without replacing their provider definitions', async () => {
  const definition = providerOpenRouterAI
  const instance = await definition.createProvider({ apiKey: 'test' })
  const inference = getGenerationProvider(instance)
  expect(inference?.generation('model')).toMatchObject({ protocol: 'chat-completions', config: { model: 'model' } })
  if (!inference)
    throw new Error('Expected a chat inference provider')
  expect(getGenerationProvider(inference)).toBe(inference)
})

it('declares protocol and search settings without rendering a settings page', async () => {
  const schema = await providerOpenAI.createProviderConfig({ t: key => key, config: { api: 'chat-completions' } })
  if (!(schema instanceof z.ZodObject))
    throw new Error('Expected an object configuration schema')
  expect(schema.parse({ apiKey: 'test' })).toMatchObject({ api: 'responses', webSearch: false })
  expect(schema.shape.webSearch.meta()).toMatchObject({ disabled: true })
  const custom = await providerOpenAI.createProviderConfig({ t: key => key, config: { baseUrl: 'https://custom.test/v1', api: 'responses' } })
  if (!(custom instanceof z.ZodObject))
    throw new Error('Expected an object configuration schema')
  expect(custom.shape.webSearch.meta()).toMatchObject({ disabled: true })
})

import { afterEach, describe, expect, it, vi } from 'vitest'

import { providerGitHubModels } from './index'

const originalFetch = globalThis.fetch

describe('providerGitHubModels', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    globalThis.fetch = originalFetch
  })

  it('loads models from the catalog endpoint instead of the inference base url', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify([
      {
        id: 'openai/gpt-4.1',
        name: 'OpenAI GPT-4.1',
        summary: 'A strong general model',
        capabilities: ['tool-calling'],
        limits: {
          max_input_tokens: 1_048_576,
        },
      },
    ]), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }))

    globalThis.fetch = fetchMock

    const models = await providerGitHubModels.extraMethods?.listModels?.({
      apiKey: 'ghp_test',
      baseUrl: 'https://example.invalid/inference',
    }, {} as never)

    expect(fetchMock).toHaveBeenCalledWith('https://models.github.ai/catalog/models', {
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer ghp_test',
      },
    })
    expect(models).toEqual([
      {
        id: 'openai/gpt-4.1',
        name: 'OpenAI GPT-4.1',
        provider: 'github-models',
        description: 'A strong general model',
        capabilities: ['tool-calling'],
        contextLength: 1_048_576,
        deprecated: false,
      },
    ])
  })

  it('places base url in advanced settings', () => {
    const schema = providerGitHubModels.createProviderConfig({ t: input => input })
    const shape = (schema as unknown as { shape: Record<string, { meta: () => Record<string, unknown> }> }).shape

    expect(shape.baseUrl.meta().section).toBe('advanced')
  })
})

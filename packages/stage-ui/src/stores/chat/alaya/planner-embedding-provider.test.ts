import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPlannerEmbeddingProvider } from './planner-embedding-provider'

const embedManyMock = vi.fn()

vi.mock('@xsai/embed', () => ({
  embedMany: (...args: unknown[]) => embedManyMock(...args),
}))

describe('planner embedding provider', () => {
  beforeEach(() => {
    embedManyMock.mockReset()
  })

  it('embeds texts through configured provider runtime in batches', async () => {
    const embedFactory = vi.fn((model: string) => ({
      model,
      baseURL: 'https://example.com/v1/',
      apiKey: 'test-key',
    }))
    const getProviderInstance = vi.fn(async () => ({
      embed: embedFactory,
    }))

    embedManyMock
      .mockResolvedValueOnce({
        embeddings: [[0.1, 0.2, 0.3]],
      })
      .mockResolvedValueOnce({
        embeddings: [[0.4, 0.5, 0.6]],
      })

    const provider = createPlannerEmbeddingProvider({
      resolveRuntime: () => ({
        enabled: true,
        providerId: 'openai',
        model: 'text-embedding-3-small',
        timeoutMs: 8_000,
        batchSize: 1,
      }),
      getProviderInstance,
    })

    const output = await provider.embed({
      texts: [
        'User prefers concise replies.',
        'The user name is Kiriko.',
      ],
    })

    expect(getProviderInstance).toHaveBeenCalledWith('openai')
    expect(embedFactory).toHaveBeenCalledTimes(2)
    expect(embedManyMock).toHaveBeenCalledTimes(2)
    expect(output.model).toBe('text-embedding-3-small')
    expect(output.dimension).toBe(3)
    expect(output.vectors).toHaveLength(2)
    expect(output.vectors[0]).toEqual([0.1, 0.2, 0.3])
    expect(output.vectors[1]).toEqual([0.4, 0.5, 0.6])
  })

  it('throws when selected provider does not expose embed capability', async () => {
    const provider = createPlannerEmbeddingProvider({
      resolveRuntime: () => ({
        enabled: true,
        providerId: 'invalid-provider',
        model: 'text-embedding-3-small',
      }),
      getProviderInstance: async () => ({}),
    })

    await expect(provider.embed({
      texts: ['hello world'],
    })).rejects.toThrow('does not support embedding')
    expect(embedManyMock).not.toHaveBeenCalled()
  })

  it('applies runtime baseURL override for region-based routing', async () => {
    const embedFactory = vi.fn((model: string) => ({
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'openai-key',
      model,
    }))

    embedManyMock.mockResolvedValueOnce({
      embeddings: [[0.9, 0.8]],
    })

    const provider = createPlannerEmbeddingProvider({
      resolveRuntime: () => ({
        enabled: true,
        providerId: 'openai-compatible',
        model: 'text-embedding-v4',
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'qwen-key',
      }),
      getProviderInstance: async () => ({
        embed: embedFactory,
      }),
    })

    await provider.embed({
      texts: ['Memory text'],
    })

    expect(embedManyMock).toHaveBeenCalledTimes(1)
    const input = embedManyMock.mock.calls[0]?.[0] as { baseURL?: string, apiKey?: string, model?: string }
    expect(input.baseURL).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1')
    expect(input.apiKey).toBe('qwen-key')
    expect(input.model).toBe('text-embedding-v4')
  })
})

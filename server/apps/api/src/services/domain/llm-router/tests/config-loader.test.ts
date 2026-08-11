import type { ConfigKVService } from '../../../adapters/config-kv'
import type { RouterConfig } from '../types'

import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../../../utils/error'
import { createConfigLoader } from '../config-loader'

function makeConfig(): RouterConfig {
  return {
    llm: {
      models: {
        'openai/gpt-5-mini': {
          upstreams: [
            {
              baseURL: 'https://openrouter.example/v1',
              keys: [{ id: 'k1', ciphertext: 'v1.aa.bb.cc' }],
              headerTemplate: 'Bearer {KEY}',
            },
          ],
          fallbackTriggers: { httpCodes: [401, 402, 403, 429, 500, 502, 503, 504], onTimeout: true },
        },
      },
    },
    tts: {
      models: {
        'tts-1': {
          provider: 'azure',
          upstreams: [
            {
              baseURL: 'https://azure.example/tts',
              keys: [{ id: 'tk1', ciphertext: 'v1.aa.bb.cc' }],
              adapterParams: {},
            },
          ],
          fallbackTriggers: { httpCodes: [401, 402, 403, 429, 500, 502, 503, 504], onTimeout: true },
        },
      },
    },
    defaults: { perAttemptTimeoutMs: 30000, fullChainTimeoutMs: 60000, fallbackHttpCodes: [401, 402, 403, 429, 500, 502, 503, 504] },
  } as RouterConfig
}

function makeMockConfigKV(value: RouterConfig | null): ConfigKVService {
  return {
    getOptional: vi.fn(async (key: string) => (key === 'LLM_ROUTER_CONFIG' ? value : null)),
    getOrThrow: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  } as unknown as ConfigKVService
}

describe('createConfigLoader', () => {
  /**
   * @example loader.getModelConfig('llm', 'x') hits configKV once, then serves cache
   */
  it('first call reads from configKV; subsequent calls within TTL serve from cache (one read)', async () => {
    const configKV = makeMockConfigKV(makeConfig())
    let nowValue = 1000
    const loader = createConfigLoader({ configKV, ttlMs: 5000, now: () => nowValue })

    await loader.getModelConfig('llm', 'openai/gpt-5-mini')
    nowValue = 2000
    await loader.getModelConfig('llm', 'openai/gpt-5-mini')
    nowValue = 4999
    await loader.getModelConfig('llm', 'openai/gpt-5-mini')

    expect((configKV.getOptional as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
  })

  it('invalidate() clears cache; next call re-reads from configKV', async () => {
    const configKV = makeMockConfigKV(makeConfig())
    let nowValue = 1000
    const loader = createConfigLoader({ configKV, ttlMs: 5000, now: () => nowValue })

    await loader.getModelConfig('llm', 'openai/gpt-5-mini')
    loader.invalidate()
    nowValue = 1001
    await loader.getModelConfig('llm', 'openai/gpt-5-mini')

    expect((configKV.getOptional as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
  })

  it('tTL expiry triggers fresh read on next call', async () => {
    const configKV = makeMockConfigKV(makeConfig())
    let nowValue = 1000
    const loader = createConfigLoader({ configKV, ttlMs: 5000, now: () => nowValue })

    await loader.getModelConfig('llm', 'openai/gpt-5-mini')
    nowValue = 1000 + 5001
    await loader.getModelConfig('llm', 'openai/gpt-5-mini')

    expect((configKV.getOptional as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
  })

  it('missing LLM_ROUTER_CONFIG → throws CONFIG_NOT_SET (503)', async () => {
    const configKV = makeMockConfigKV(null)
    const loader = createConfigLoader({ configKV })

    await expect(loader.getModelConfig('llm', 'any-model')).rejects.toBeInstanceOf(ApiError)
    try {
      await loader.getModelConfig('llm', 'any-model')
    }
    catch (err) {
      expect((err as ApiError).statusCode).toBe(503)
      expect((err as ApiError).errorCode).toBe('CONFIG_NOT_SET')
    }
  })

  it('unknown LLM model name → 400 BAD_REQUEST with requested + available list (pre-upstream rejection)', async () => {
    const configKV = makeMockConfigKV(makeConfig())
    const loader = createConfigLoader({ configKV })

    try {
      await loader.getModelConfig('llm', 'nope/does-not-exist')
      throw new Error('expected throw')
    }
    catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      expect((err as ApiError).statusCode).toBe(400)
      expect((err as ApiError).errorCode).toBe('BAD_REQUEST')
      expect((err as ApiError).details).toEqual({
        requested: 'nope/does-not-exist',
        available: ['openai/gpt-5-mini'],
      })
    }
  })

  it('unknown TTS model name → 400 BAD_REQUEST with TTS model list (not LLM list)', async () => {
    const configKV = makeMockConfigKV(makeConfig())
    const loader = createConfigLoader({ configKV })

    try {
      await loader.getModelConfig('tts', 'nope-tts')
      throw new Error('expected throw')
    }
    catch (err) {
      expect((err as ApiError).statusCode).toBe(400)
      expect((err as ApiError).details).toEqual({
        requested: 'nope-tts',
        available: ['tts-1'],
      })
    }
  })

  it('returns the tagged model slice for both kinds', async () => {
    const configKV = makeMockConfigKV(makeConfig())
    const loader = createConfigLoader({ configKV })

    const llm = await loader.getModelConfig('llm', 'openai/gpt-5-mini')
    expect(llm.kind).toBe('llm')
    if (llm.kind === 'llm') {
      expect(llm.model.upstreams).toHaveLength(1)
      expect(llm.model.upstreams[0].baseURL).toBe('https://openrouter.example/v1')
    }

    const tts = await loader.getModelConfig('tts', 'tts-1')
    expect(tts.kind).toBe('tts')
    if (tts.kind === 'tts') {
      expect(tts.model.provider).toBe('azure')
    }
  })
})

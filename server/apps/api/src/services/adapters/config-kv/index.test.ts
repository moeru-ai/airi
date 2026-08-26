import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import { createConfigKVService } from './index'

function createMockStore() {
  const store = new Map<string, string>()
  return {
    _store: store,
    getFreshRaw: vi.fn(async (key: string) => store.get(key) ?? null),
    getRaw: vi.fn(async (key: string) => store.get(key) ?? null),
    invalidateCache: vi.fn(async () => {}),
  }
}

describe('configKVService', () => {
  let store: ReturnType<typeof createMockStore>
  let service: ReturnType<typeof createConfigKVService>

  beforeEach(() => {
    store = createMockStore()
    service = createConfigKVService(store)
  })

  it('uses the ConfigKV schema as the key type', () => {
    expectTypeOf(service.get('FLUX_PER_REQUEST')).toEqualTypeOf<Promise<number>>()
  })

  it('get should throw 503 when key is not set', async () => {
    await expect(service.getOrThrow('FLUX_PER_1K_CHARS_TTS'))
      .rejects
      .toThrow('Service configuration is incomplete')
  })

  it('get should return numeric value when key is set', async () => {
    store._store.set('FLUX_PER_REQUEST', '5')

    const value = await service.getOrThrow('FLUX_PER_REQUEST')
    expect(value).toBe(5)
  })

  it('get should read the requested ConfigKV key', async () => {
    store._store.set('FLUX_PER_REQUEST', '3')

    await service.getOrThrow('FLUX_PER_REQUEST')
    expect(store.getRaw).toHaveBeenCalledWith('FLUX_PER_REQUEST')
  })

  it('getOptional should return schema default when key has one', async () => {
    const value = await service.getOptional('FLUX_PER_REQUEST')
    expect(value).toBe(5)
  })

  it('getOptional should return null when required key is not set', async () => {
    const value = await service.getOptional('FLUX_PER_1K_CHARS_TTS')
    expect(value).toBeNull()
  })

  it('getOptional should return numeric value when key is set', async () => {
    store._store.set('INITIAL_USER_FLUX', '200')

    const value = await service.getOptional('INITIAL_USER_FLUX')
    expect(value).toBe(200)
  })

  it('getOptional should throw CONFIG_INVALID when the store contains malformed JSON', async () => {
    // ROOT CAUSE:
    //
    // If an operator stores invalid LLM_ROUTER_CONFIG JSON in PostgreSQL,
    // JSON.parse used to throw SyntaxError through the request handler and log
    // it as an unhandled 500.
    //
    // We fixed this by translating stored config parse/validation failures into
    // a stable API error at the configKV boundary.
    store._store.set('LLM_ROUTER_CONFIG', '{"llm":{}')

    await expect(service.getOptional('LLM_ROUTER_CONFIG'))
      .rejects
      .toMatchObject({
        errorCode: 'CONFIG_INVALID',
        statusCode: 503,
      })
  })

  it('getOptional should throw CONFIG_INVALID when the store contains schema-invalid JSON', async () => {
    store._store.set('FLUX_PER_REQUEST', JSON.stringify('5'))

    await expect(service.getOptional('FLUX_PER_REQUEST'))
      .rejects
      .toMatchObject({
        errorCode: 'CONFIG_INVALID',
        statusCode: 503,
      })
  })

  it('wraps database failures as CONFIG_UNAVAILABLE', async () => {
    store.getRaw.mockRejectedValueOnce(new Error('database offline'))

    await expect(service.getOrThrow('FLUX_PER_REQUEST'))
      .rejects
      .toMatchObject({
        errorCode: 'CONFIG_UNAVAILABLE',
        statusCode: 503,
      })
  })

  /**
   * @example
   * store._store.set('LLM_ROUTER_CONFIG', JSON.stringify(config))
   */
  it('llm router config should preserve official ASR model config', async () => {
    store._store.set('LLM_ROUTER_CONFIG', JSON.stringify({
      asr: {
        models: {
          auto: {
            provider: 'aliyun-nls',
            upstreams: [{
              adapterParams: {
                accessKeyId: 'ak',
                appKey: 'app',
                region: 'cn-shanghai',
              },
              keys: [{ ciphertext: 'ciphertext', id: 'aliyun-nls-asr-prod-1' }],
            }],
          },
        },
      },
      defaults: {
        fallbackHttpCodes: [401, 402, 403, 429, 500, 502, 503, 504],
        fullChainTimeoutMs: 60000,
        perAttemptTimeoutMs: 30000,
      },
      llm: { models: {} },
      tts: { models: {} },
    }))

    const value = await service.getOrThrow('LLM_ROUTER_CONFIG')
    const asr = value.asr
    if (!asr)
      throw new Error('Expected ASR config to be preserved')

    expect(asr.models.auto.provider).toBe('aliyun-nls')
    expect(asr.models.auto.upstreams[0].adapterParams).toEqual({
      accessKeyId: 'ak',
      appKey: 'app',
      region: 'cn-shanghai',
    })
  })

  it('llm router config should preserve explicit LLM and TTS provider groups', async () => {
    store._store.set('LLM_ROUTER_CONFIG', JSON.stringify({
      defaults: {
        fallbackHttpCodes: [401, 402, 403, 429, 500, 502, 503, 504],
        fullChainTimeoutMs: 60000,
        perAttemptTimeoutMs: 30000,
      },
      llm: {
        models: {
          'step-3.5-flash': {
            fallbackTriggers: {
              httpCodes: [401, 402, 403, 429, 500, 502, 503, 504],
              onTimeout: true,
            },
            routing: {
              groups: [
                {
                  continueOn: { httpCodes: [402], onTimeout: false },
                  id: 'plan',
                  retryOn: { httpCodes: [402, 429, 500, 502, 503, 504], onTimeout: true },
                  upstreamIds: ['plan'],
                },
                {
                  id: 'paygo',
                  retryOn: { httpCodes: [429, 500, 502, 503, 504], onTimeout: true },
                  upstreamIds: ['paygo'],
                },
              ],
            },
            upstreams: [
              {
                baseURL: 'https://api.stepfun.com/step_plan/v1',
                headerTemplate: 'Bearer {KEY}',
                id: 'plan',
                keys: [{ ciphertext: 'plan-ciphertext', id: 'plan-key' }],
              },
              {
                baseURL: 'https://api.stepfun.com/v1',
                headerTemplate: 'Bearer {KEY}',
                id: 'paygo',
                keys: [{ ciphertext: 'paygo-ciphertext', id: 'paygo-key' }],
              },
            ],
          },
        },
      },
      tts: {
        models: {
          'stepfun/stepaudio-2.5-tts': {
            fallbackTriggers: {
              httpCodes: [401, 402, 429, 500, 502, 503, 504],
              onTimeout: true,
            },
            provider: 'stepfun',
            routing: {
              groups: [
                {
                  continueOn: { httpCodes: [402], onTimeout: false },
                  id: 'plan',
                  retryOn: { httpCodes: [402, 429, 500, 502, 503, 504], onTimeout: true },
                  strategy: 'least-inflight',
                  upstreamIds: ['plan'],
                },
                {
                  id: 'paygo',
                  retryOn: { httpCodes: [429, 500, 502, 503, 504], onTimeout: true },
                  strategy: 'ordered',
                  upstreamIds: ['paygo'],
                },
              ],
            },
            upstreams: [
              {
                adapterParams: { endpointProfile: 'step-plan' },
                baseURL: 'https://api.stepfun.com',
                id: 'plan',
                keys: [{ ciphertext: 'plan-ciphertext', id: 'plan-key' }],
                maxConcurrency: 1,
              },
              {
                adapterParams: { endpointProfile: 'default' },
                baseURL: 'https://api.stepfun.com',
                id: 'paygo',
                keys: [{ ciphertext: 'paygo-ciphertext', id: 'paygo-key' }],
              },
            ],
          },
        },
      },
    }))

    const value = await service.getOrThrow('LLM_ROUTER_CONFIG')
    const model = value.tts.models['stepfun/stepaudio-2.5-tts']

    expect(value.llm.models['step-3.5-flash'].routing?.groups.map(group => group.id)).toEqual(['plan', 'paygo'])
    expect(model.routing?.groups.map(group => group.id)).toEqual(['plan', 'paygo'])
    expect(model.routing?.groups[0].continueOn).toEqual({
      httpCodes: [402],
      onTimeout: false,
    })
  })

  it('rejects a TTS provider group that references an unknown upstream', async () => {
    store._store.set('LLM_ROUTER_CONFIG', JSON.stringify({
      llm: { models: {} },
      tts: {
        models: {
          tts: {
            provider: 'stepfun',
            routing: {
              groups: [{
                id: 'plan',
                retryOn: { httpCodes: [402], onTimeout: false },
                strategy: 'ordered',
                upstreamIds: ['missing'],
              }],
            },
            upstreams: [{
              baseURL: 'https://api.stepfun.com',
              id: 'plan',
              keys: [{ ciphertext: 'ciphertext', id: 'plan-key' }],
            }],
          },
        },
      },
    }))

    await expect(service.getOptional('LLM_ROUTER_CONFIG'))
      .rejects
      .toMatchObject({
        errorCode: 'CONFIG_INVALID',
        statusCode: 503,
      })
  })

  it('rejects least-inflight routing without an explicit concurrency cap', async () => {
    store._store.set('LLM_ROUTER_CONFIG', JSON.stringify({
      llm: { models: {} },
      tts: {
        models: {
          tts: {
            provider: 'stepfun',
            routing: {
              groups: [{
                id: 'plan',
                retryOn: { httpCodes: [402], onTimeout: false },
                strategy: 'least-inflight',
                upstreamIds: ['plan'],
              }],
            },
            upstreams: [{
              baseURL: 'https://api.stepfun.com',
              id: 'plan',
              keys: [{ ciphertext: 'ciphertext', id: 'plan-key' }],
            }],
          },
        },
      },
    }))

    await expect(service.getOptional('LLM_ROUTER_CONFIG'))
      .rejects
      .toMatchObject({
        errorCode: 'CONFIG_INVALID',
        statusCode: 503,
      })
  })

  it('refresh should bypass the ordinary store read', async () => {
    store._store.set('STRIPE_FLUX_PRODUCT_ID', JSON.stringify('prod_abc123'))

    await expect(service.refresh('STRIPE_FLUX_PRODUCT_ID')).resolves.toBe('prod_abc123')
    expect(store.getFreshRaw).toHaveBeenCalledWith('STRIPE_FLUX_PRODUCT_ID')
    expect(store.getRaw).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import { createConfigKVService } from './index'

function createMockStore() {
  const store = new Map<string, string>()
  return {
    getRaw: vi.fn(async (key: string) => store.get(key) ?? null),
    getFreshRaw: vi.fn(async (key: string) => store.get(key) ?? null),
    invalidateCache: vi.fn(async () => {}),
    _store: store,
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
        statusCode: 503,
        errorCode: 'CONFIG_INVALID',
      })
  })

  it('getOptional should throw CONFIG_INVALID when the store contains schema-invalid JSON', async () => {
    store._store.set('FLUX_PER_REQUEST', JSON.stringify('5'))

    await expect(service.getOptional('FLUX_PER_REQUEST'))
      .rejects
      .toMatchObject({
        statusCode: 503,
        errorCode: 'CONFIG_INVALID',
      })
  })

  // https://github.com/moeru-ai/airi/pull/2445#discussion_r3913931906
  // ROOT CAUSE:
  //
  // The streaming TTS config accepted an empty default model. The catalog
  // exposed that value as a present default, so clients skipped their fallback.
  //
  // Before: defaultModel used optional(string()).
  //
  // We fixed this by rejecting an empty configured default at the ConfigKV boundary.
  it('rejects an empty streaming TTS default model', async () => {
    store._store.set('UNSPEECH_UPSTREAM', JSON.stringify({
      restBaseURL: 'http://unspeech.local:5933',
      streaming: {
        baseURL: 'wss://unspeech.local',
        keys: [{ id: 'k1', ciphertext: 'enc' }],
        defaultModel: '',
      },
    }))

    await expect(service.getOptional('UNSPEECH_UPSTREAM'))
      .rejects
      .toMatchObject({
        statusCode: 503,
        errorCode: 'CONFIG_INVALID',
      })
  })

  it('wraps database failures as CONFIG_UNAVAILABLE', async () => {
    store.getRaw.mockRejectedValueOnce(new Error('database offline'))

    await expect(service.getOrThrow('FLUX_PER_REQUEST'))
      .rejects
      .toMatchObject({
        statusCode: 503,
        errorCode: 'CONFIG_UNAVAILABLE',
      })
  })

  /**
   * @example
   * store._store.set('LLM_ROUTER_CONFIG', JSON.stringify(config))
   */
  it('llm router config should preserve official ASR model config', async () => {
    store._store.set('LLM_ROUTER_CONFIG', JSON.stringify({
      llm: { models: {} },
      tts: { models: {} },
      asr: {
        models: {
          auto: {
            provider: 'aliyun-nls',
            upstreams: [{
              keys: [{ id: 'aliyun-nls-asr-prod-1', ciphertext: 'ciphertext' }],
              adapterParams: {
                accessKeyId: 'ak',
                appKey: 'app',
                region: 'cn-shanghai',
              },
            }],
          },
        },
      },
      defaults: {
        perAttemptTimeoutMs: 30000,
        fullChainTimeoutMs: 60000,
        fallbackHttpCodes: [401, 402, 403, 429, 500, 502, 503, 504],
      },
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
      llm: {
        models: {
          'step-3.5-flash': {
            upstreams: [
              {
                id: 'plan',
                baseURL: 'https://api.stepfun.com/step_plan/v1',
                keys: [{ id: 'plan-key', ciphertext: 'plan-ciphertext' }],
                headerTemplate: 'Bearer {KEY}',
              },
              {
                id: 'paygo',
                baseURL: 'https://api.stepfun.com/v1',
                keys: [{ id: 'paygo-key', ciphertext: 'paygo-ciphertext' }],
                headerTemplate: 'Bearer {KEY}',
              },
            ],
            routing: {
              groups: [
                {
                  id: 'plan',
                  upstreamIds: ['plan'],
                  retryOn: { httpCodes: [402, 429, 500, 502, 503, 504], onTimeout: true },
                  continueOn: { httpCodes: [402], onTimeout: false },
                },
                {
                  id: 'paygo',
                  upstreamIds: ['paygo'],
                  retryOn: { httpCodes: [429, 500, 502, 503, 504], onTimeout: true },
                },
              ],
            },
            fallbackTriggers: {
              httpCodes: [401, 402, 403, 429, 500, 502, 503, 504],
              onTimeout: true,
            },
          },
        },
      },
      tts: {
        models: {
          'stepfun/stepaudio-2.5-tts': {
            provider: 'stepfun',
            upstreams: [
              {
                id: 'plan',
                baseURL: 'https://api.stepfun.com',
                keys: [{ id: 'plan-key', ciphertext: 'plan-ciphertext' }],
                adapterParams: { endpointProfile: 'step-plan' },
                maxConcurrency: 1,
              },
              {
                id: 'paygo',
                baseURL: 'https://api.stepfun.com',
                keys: [{ id: 'paygo-key', ciphertext: 'paygo-ciphertext' }],
                adapterParams: { endpointProfile: 'default' },
              },
            ],
            routing: {
              groups: [
                {
                  id: 'plan',
                  upstreamIds: ['plan'],
                  strategy: 'least-inflight',
                  retryOn: { httpCodes: [402, 429, 500, 502, 503, 504], onTimeout: true },
                  continueOn: { httpCodes: [402], onTimeout: false },
                },
                {
                  id: 'paygo',
                  upstreamIds: ['paygo'],
                  strategy: 'ordered',
                  retryOn: { httpCodes: [429, 500, 502, 503, 504], onTimeout: true },
                },
              ],
            },
            fallbackTriggers: {
              httpCodes: [401, 402, 429, 500, 502, 503, 504],
              onTimeout: true,
            },
          },
        },
      },
      defaults: {
        perAttemptTimeoutMs: 30000,
        fullChainTimeoutMs: 60000,
        fallbackHttpCodes: [401, 402, 403, 429, 500, 502, 503, 504],
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
            upstreams: [{
              id: 'plan',
              baseURL: 'https://api.stepfun.com',
              keys: [{ id: 'plan-key', ciphertext: 'ciphertext' }],
            }],
            routing: {
              groups: [{
                id: 'plan',
                upstreamIds: ['missing'],
                strategy: 'ordered',
                retryOn: { httpCodes: [402], onTimeout: false },
              }],
            },
          },
        },
      },
    }))

    await expect(service.getOptional('LLM_ROUTER_CONFIG'))
      .rejects
      .toMatchObject({
        statusCode: 503,
        errorCode: 'CONFIG_INVALID',
      })
  })

  it('rejects least-inflight routing without an explicit concurrency cap', async () => {
    store._store.set('LLM_ROUTER_CONFIG', JSON.stringify({
      llm: { models: {} },
      tts: {
        models: {
          tts: {
            provider: 'stepfun',
            upstreams: [{
              id: 'plan',
              baseURL: 'https://api.stepfun.com',
              keys: [{ id: 'plan-key', ciphertext: 'ciphertext' }],
            }],
            routing: {
              groups: [{
                id: 'plan',
                upstreamIds: ['plan'],
                strategy: 'least-inflight',
                retryOn: { httpCodes: [402], onTimeout: false },
              }],
            },
          },
        },
      },
    }))

    await expect(service.getOptional('LLM_ROUTER_CONFIG'))
      .rejects
      .toMatchObject({
        statusCode: 503,
        errorCode: 'CONFIG_INVALID',
      })
  })

  it('refresh should bypass the ordinary store read', async () => {
    store._store.set('STRIPE_FLUX_PRODUCT_ID', JSON.stringify('prod_abc123'))

    await expect(service.refresh('STRIPE_FLUX_PRODUCT_ID')).resolves.toBe('prod_abc123')
    expect(store.getFreshRaw).toHaveBeenCalledWith('STRIPE_FLUX_PRODUCT_ID')
    expect(store.getRaw).not.toHaveBeenCalled()
  })
})

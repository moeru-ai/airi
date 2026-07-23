import { beforeEach, describe, expect, it, vi } from 'vitest'

import { configRedisKey } from '../../utils/redis-keys'
import { createConfigKVService } from './config-kv'

function createMockRedis() {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    _store: store,
  }
}

describe('configKVService', () => {
  let redis: ReturnType<typeof createMockRedis>
  let service: ReturnType<typeof createConfigKVService>

  beforeEach(() => {
    redis = createMockRedis()
    service = createConfigKVService(redis as any)
  })

  it('get should throw 503 when key is not set', async () => {
    await expect(service.getOrThrow('FLUX_PER_1K_CHARS_TTS'))
      .rejects
      .toThrow('Service configuration is incomplete')
  })

  it('get should return numeric value when key is set', async () => {
    redis._store.set(configRedisKey('FLUX_PER_REQUEST'), '5')

    const value = await service.getOrThrow('FLUX_PER_REQUEST')
    expect(value).toBe(5)
  })

  it('get should read from correct prefixed key', async () => {
    redis._store.set(configRedisKey('FLUX_PER_REQUEST'), '3')

    await service.getOrThrow('FLUX_PER_REQUEST')
    expect(redis.get).toHaveBeenCalledWith(configRedisKey('FLUX_PER_REQUEST'))
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
    redis._store.set(configRedisKey('INITIAL_USER_FLUX'), '200')

    const value = await service.getOptional('INITIAL_USER_FLUX')
    expect(value).toBe(200)
  })

  it('getOptional should throw CONFIG_INVALID when Redis contains malformed JSON', async () => {
    // ROOT CAUSE:
    //
    // If an operator edits config:LLM_ROUTER_CONFIG directly with invalid JSON,
    // JSON.parse used to throw SyntaxError through the request handler and log
    // it as an unhandled 500.
    //
    // We fixed this by translating stored config parse/validation failures into
    // a stable API error at the configKV boundary.
    redis._store.set(configRedisKey('LLM_ROUTER_CONFIG'), '{"llm":{}')

    await expect(service.getOptional('LLM_ROUTER_CONFIG'))
      .rejects
      .toMatchObject({
        statusCode: 503,
        errorCode: 'CONFIG_INVALID',
      })
  })

  it('getOptional should throw CONFIG_INVALID when Redis contains schema-invalid JSON', async () => {
    redis._store.set(configRedisKey('FLUX_PER_REQUEST'), JSON.stringify('5'))

    await expect(service.getOptional('FLUX_PER_REQUEST'))
      .rejects
      .toMatchObject({
        statusCode: 503,
        errorCode: 'CONFIG_INVALID',
      })
  })

  it('set should write value to Redis with prefix', async () => {
    await service.set('FLUX_PER_REQUEST', 10)

    expect(redis.set).toHaveBeenCalledWith(configRedisKey('FLUX_PER_REQUEST'), '10')
    expect(redis._store.get(configRedisKey('FLUX_PER_REQUEST'))).toBe('10')
  })

  it('set should reject invalid values for string config keys', async () => {
    await expect(service.set('STRIPE_FLUX_PRODUCT_ID', { id: 'prod_123' } as any))
      .rejects
      .toThrow()
  })

  it('set then get should round-trip correctly', async () => {
    await service.set('INITIAL_USER_FLUX', 500)

    const value = await service.getOrThrow('INITIAL_USER_FLUX')
    expect(value).toBe(500)
  })

  /**
   * @example
   * service.set('LLM_ROUTER_CONFIG', { asr: { models: { auto: model } } })
   */
  it('llm router config should preserve official ASR model config', async () => {
    await service.set('LLM_ROUTER_CONFIG', {
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
    })

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

  it('set should store string values as JSON strings', async () => {
    await service.set('STRIPE_FLUX_PRODUCT_ID', 'prod_abc123')

    expect(redis._store.get(configRedisKey('STRIPE_FLUX_PRODUCT_ID'))).toBe(JSON.stringify('prod_abc123'))
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createConfigKVService } from '../config-kv'

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

  // --- get ---

  it('get should throw 503 when key is not set', async () => {
    await expect(service.getOrThrow('FLUX_PER_CENT'))
      .rejects
      .toThrow('Config key "FLUX_PER_CENT" is not set in Redis')
  })

  it('get should return numeric value when key is set', async () => {
    redis._store.set('config:FLUX_PER_CENT', '5')

    const value = await service.getOrThrow('FLUX_PER_CENT')
    expect(value).toBe(5)
  })

  it('get should read from correct prefixed key', async () => {
    redis._store.set('config:FLUX_PER_REQUEST', '3')

    await service.getOrThrow('FLUX_PER_REQUEST')
    expect(redis.get).toHaveBeenCalledWith('config:FLUX_PER_REQUEST')
  })

  // --- getOptional ---

  it('getOptional should return null when key is not set', async () => {
    const value = await service.getOptional('FLUX_PER_CENT')
    expect(value).toBeNull()
  })

  it('getOptional should return numeric value when key is set', async () => {
    redis._store.set('config:INITIAL_USER_FLUX', '200')

    const value = await service.getOptional('INITIAL_USER_FLUX')
    expect(value).toBe(200)
  })

  // --- set ---

  it('set should write value to Redis with prefix', async () => {
    await service.set('FLUX_PER_CENT', 10)

    expect(redis.set).toHaveBeenCalledWith('config:FLUX_PER_CENT', '10')
    expect(redis._store.get('config:FLUX_PER_CENT')).toBe('10')
  })

  it('set then get should round-trip correctly', async () => {
    await service.set('INITIAL_USER_FLUX', 500)

    const value = await service.getOrThrow('INITIAL_USER_FLUX')
    expect(value).toBe(500)
  })

  // --- FLUX_PACKAGES (JSON) ---

  it('get FLUX_PACKAGES should parse JSON array', async () => {
    const packages = [
      { amount: 500, label: '500 Flux', price: '$5' },
      { amount: 1000, label: '1000 Flux', price: '$10' },
    ]
    redis._store.set('config:FLUX_PACKAGES', JSON.stringify(packages))

    const value = await service.getOrThrow('FLUX_PACKAGES')
    expect(value).toEqual(packages)
  })

  it('set FLUX_PACKAGES should serialize as JSON', async () => {
    const packages = [{ amount: 500, label: '500 Flux', price: '$5' }]
    await service.set('FLUX_PACKAGES', packages)

    const stored = redis._store.get('config:FLUX_PACKAGES')
    expect(stored).toBe(JSON.stringify(packages))
  })

  it('fLUX_PACKAGES round-trip should preserve structure', async () => {
    const packages = [
      { amount: 500, label: '500 Flux', price: '$5' },
      { amount: 1000, label: '1000 Flux', price: '$10' },
      { amount: 5000, label: '5000 Flux', price: '$45' },
    ]
    await service.set('FLUX_PACKAGES', packages)

    const value = await service.getOrThrow('FLUX_PACKAGES')
    expect(value).toEqual(packages)
  })

  it('getOptional FLUX_PACKAGES should return null when not set', async () => {
    const value = await service.getOptional('FLUX_PACKAGES')
    expect(value).toBeNull()
  })
})

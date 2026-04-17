import { Buffer } from 'node:buffer'
import { promisify } from 'node:util'
import { gzip } from 'node:zlib'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getCompressed, setCompressed } from '../redis-compressed'

const gzipAsync = promisify(gzip)

function createMockRedis() {
  const store = new Map<string, Buffer>()
  return {
    getBuffer: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string | Buffer, _ex?: string, _ttl?: number) => {
      store.set(key, Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8'))
      return 'OK'
    }),
    _store: store,
  }
}

describe('redis-compressed', () => {
  let redis: ReturnType<typeof createMockRedis>

  beforeEach(() => {
    redis = createMockRedis()
  })

  describe('setCompressed', () => {
    it('writes gzipped bytes under the key', async () => {
      await setCompressed(redis as any, 'k', 'hello world'.repeat(100))

      const stored = redis._store.get('k')
      expect(stored).toBeDefined()
      expect(stored![0]).toBe(0x1F)
      expect(stored![1]).toBe(0x8B)
    })

    it('sets TTL via EX when ttlSeconds is provided', async () => {
      await setCompressed(redis as any, 'k', 'payload', 600)

      expect(redis.set).toHaveBeenCalledWith('k', expect.any(Buffer), 'EX', 600)
    })

    it('omits EX when ttlSeconds is undefined', async () => {
      await setCompressed(redis as any, 'k', 'payload')

      const [, , ex] = redis.set.mock.calls[0]
      expect(ex).toBeUndefined()
    })

    it('round-trips: value written by setCompressed reads back identical via getCompressed', async () => {
      const original = JSON.stringify({ voices: Array.from({ length: 50 }, (_, i) => ({ id: `v-${i}` })) })
      await setCompressed(redis as any, 'k', original)

      const read = await getCompressed(redis as any, 'k')
      expect(read).toBe(original)
    })
  })

  describe('getCompressed', () => {
    it('returns null on cache miss', async () => {
      const result = await getCompressed(redis as any, 'missing')
      expect(result).toBeNull()
    })

    it('gunzips entries written with gzip magic bytes', async () => {
      const text = 'payload'.repeat(50)
      const compressed = await gzipAsync(text)
      redis._store.set('k', compressed)

      const result = await getCompressed(redis as any, 'k')
      expect(result).toBe(text)
    })

    it('returns legacy plain-text entries as utf-8 without attempting gunzip', async () => {
      redis._store.set('k', Buffer.from('{"legacy":"value"}', 'utf8'))

      const result = await getCompressed(redis as any, 'k')
      expect(result).toBe('{"legacy":"value"}')
    })
  })
})

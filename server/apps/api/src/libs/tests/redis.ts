import type Redis from 'ioredis'

import RedisMock from 'ioredis-mock'

let nextPort = 16379

/**
 * Creates an isolated in-memory Redis client for one test.
 *
 * ioredis-mock shares state between clients that use the same host and port.
 * A unique port keeps unrelated tests from reading each other's keys, while
 * `duplicate()` still shares state with the client that created it.
 */
export function createTestRedis(): Redis {
  const redis = new RedisMock(nextPort, '127.0.0.1')
  nextPort += 1
  return redis
}

/**
 * Reads every entry of a Redis Stream as a field record, oldest first.
 *
 * @example
 * await readStreamFields(redis, 'account-events')
 * // => [{ id: 'revenuecat:evt-1', type: 'subscription.renewed', ... }]
 */
export async function readStreamFields(redis: Redis, key: string): Promise<Record<string, string>[]> {
  const entries = await redis.xrange(key, '-', '+')
  return entries.map(([, fields]) => {
    const record: Record<string, string> = {}
    for (let index = 0; index < fields.length; index += 2)
      record[fields[index]!] = fields[index + 1]!
    return record
  })
}

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

import type Redis from 'ioredis'

import { integer, literal, minValue, number, parse, pipe, string, tuple, union } from 'valibot'

const ttlSchema = pipe(number(), integer(), minValue(1))
const snapshotSchema = union([tuple([literal(0)]), tuple([literal(1), string()])])

// Read the value and expiry in one operation so a concurrent replacement
// cannot pair one snapshot with another snapshot's expiry. Reads never renew it.
// The reply is [0] for a miss or [1, value] for a hit, including empty strings.
const readSnapshot = `
if redis.call('PTTL', KEYS[1]) < 0 then
  return {0}
end
return {1, redis.call('GET', KEYS[1])}
`

/** Reads an expiring string snapshot. Missing or persistent entries return null. Redis errors propagate. */
export async function readCache(redis: Redis, key: string): Promise<string | null> {
  const snapshot = parse(snapshotSchema, await redis.eval(readSnapshot, 1, key))
  return snapshot[0] === 1 ? snapshot[1] : null
}

/** Writes the value and expiry atomically. TTL must be a positive integer in seconds. Redis errors propagate. */
export async function writeCache(redis: Redis, key: string, value: string, options: { ttlSeconds: number }): Promise<void> {
  const ttlSeconds = parse(ttlSchema, options.ttlSeconds)
  await redis.set(key, value, 'EX', ttlSeconds)
}

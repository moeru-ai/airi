import type { Buffer } from 'node:buffer'

import type Redis from 'ioredis'

import { promisify } from 'node:util'
import { gunzip, gzip } from 'node:zlib'

const gzipAsync = promisify(gzip)
const gunzipAsync = promisify(gunzip)

// First two bytes of a gzip stream are 0x1F 0x8B. Used to distinguish gzipped
// payloads from legacy plain-text entries written before compression was
// introduced for a given key.
function isGzipped(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0x1F && buf[1] === 0x8B
}

/**
 * Read a Redis value, transparently gunzipping it when it was written by
 * `setCompressed`. Non-gzipped payloads (e.g. pre-compression legacy entries,
 * or values set via raw `redis.set`) are returned as plain utf-8 strings so
 * callers can migrate existing keys without a forced invalidation.
 *
 * Use when: value size is large enough (~1KB+) that gzip wins on Redis/network
 * bandwidth, and you accept the ~10ms CPU trade per request. Caller still
 * handles parse/validate since we only care about bytes in transit.
 *
 * Returns null on cache miss.
 */
export async function getCompressed(redis: Redis, key: string): Promise<string | null> {
  const cached = await redis.getBuffer(key)
  if (cached == null)
    return null

  return isGzipped(cached)
    ? (await gunzipAsync(cached)).toString('utf8')
    : cached.toString('utf8')
}

/**
 * Gzip-compress the value and store under key. Always writes gzipped bytes so
 * subsequent `getCompressed` reads never hit the legacy passthrough branch.
 *
 * Expects: caller has already serialized the value (JSON.stringify, etc.) —
 * this helper is deliberately type-free about what the string represents.
 */
export async function setCompressed(
  redis: Redis,
  key: string,
  value: string,
  ttlSeconds?: number,
): Promise<void> {
  const compressed = await gzipAsync(value)
  if (ttlSeconds != null) {
    await redis.set(key, compressed, 'EX', ttlSeconds)
  }
  else {
    await redis.set(key, compressed)
  }
}

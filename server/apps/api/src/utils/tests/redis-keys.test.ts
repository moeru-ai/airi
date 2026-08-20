import { describe, expect, it } from 'vitest'

import {
  lockRedisKey,
  redisKeyFrom,
  userChatBroadcastRedisKey,
  userChatBroadcastRedisPattern,
  userFluxRedisKey,
} from '../redis-keys'

describe('redis key utils', () => {
  it('builds colon-separated keys from normalized segments', () => {
    expect(redisKeyFrom('user', '123', 'flux')).toBe('user:123:flux')
    expect(redisKeyFrom(' lock ', 42, ' job ')).toBe('lock:42:job')
  })

  it('rejects empty key definitions', () => {
    expect(() => redisKeyFrom()).toThrow('Redis keys must contain at least one segment')
    expect(() => redisKeyFrom('user', '   ', 'flux')).toThrow('Redis key segments must not be empty')
  })

  it('exposes stable helpers for user and lock namespaces', () => {
    expect(userFluxRedisKey('user-1')).toBe('user:user-1:flux')
    expect(userChatBroadcastRedisKey('user-1')).toBe('user:user-1:chat:broadcast')
    expect(userChatBroadcastRedisPattern()).toBe('user:*:chat:broadcast')
    expect(lockRedisKey('user', 'user-1', 'flux')).toBe('lock:user:user-1:flux')
  })
})

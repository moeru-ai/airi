import { describe, expect, it } from 'vitest'

import {
  configRedisKey,
  createRedisKey,
  DEFAULT_BILLING_EVENTS_STREAM,
  lockRedisKey,
  userChatBroadcastRedisKey,
  userFluxRedisKey,
} from '../redis-keys'

describe('redis key utils', () => {
  it('builds colon-separated keys from normalized segments', () => {
    expect(createRedisKey('user', '123', 'flux')).toBe('user:123:flux')
    expect(createRedisKey(' lock ', 42, ' job ')).toBe('lock:42:job')
  })

  it('rejects empty key definitions', () => {
    expect(() => createRedisKey()).toThrow('Redis keys must contain at least one segment')
    expect(() => createRedisKey('user', '   ', 'flux')).toThrow('Redis key segments must not be empty')
  })

  it('exposes stable helpers for config, user, and lock namespaces', () => {
    expect(DEFAULT_BILLING_EVENTS_STREAM).toBe('billing:events')
    expect(configRedisKey('GATEWAY_BASE_URL')).toBe('config:GATEWAY_BASE_URL')
    expect(userFluxRedisKey('user-1')).toBe('user:user-1:flux')
    expect(userChatBroadcastRedisKey('user-1')).toBe('user:user-1:chat:broadcast')
    expect(lockRedisKey('user', 'user-1', 'flux')).toBe('lock:user:user-1:flux')
  })
})

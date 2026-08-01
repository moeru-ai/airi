import type Redis from 'ioredis'

import { describe, expect, it, vi } from 'vitest'

import { createAuthConfigService } from './auth-config'

function createRedis(values: Record<string, string | null>): Redis {
  return {
    get: vi.fn(async (key: string) => values[key] ?? null),
  } as unknown as Redis
}

describe('auth config service', () => {
  it('uses Auth-owned defaults when the shared Redis keys are absent', async () => {
    const service = createAuthConfigService(createRedis({}))

    expect(await service.getRateLimit()).toEqual({ max: 20, windowSec: 60 })
  })

  it('reads rate-limit values without loading the API ConfigKV schema', async () => {
    const service = createAuthConfigService(createRedis({
      'config:AUTH_RATE_LIMIT_MAX': '40',
      'config:AUTH_RATE_LIMIT_WINDOW_SEC': '120',
    }))

    expect(await service.getRateLimit()).toEqual({ max: 40, windowSec: 120 })
  })

  it('rejects malformed stored values at the Auth boundary', async () => {
    const service = createAuthConfigService(createRedis({
      'config:AUTH_RATE_LIMIT_MAX': '"forty"',
    }))

    await expect(service.getRateLimit()).rejects.toMatchObject({
      errorCode: 'CONFIG_INVALID',
    })
  })
})

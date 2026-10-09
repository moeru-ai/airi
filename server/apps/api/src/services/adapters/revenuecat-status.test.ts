import type Redis from 'ioredis'

import { describe, expect, it, vi } from 'vitest'

import { createTestRedis } from '../../libs/tests/redis'
import { ApiError } from '../../utils/error'
import { userSubscriptionStatusRedisKey } from '../../utils/redis-keys'
import { createRevenuecatStatus } from './revenuecat-status'

const now = new Date('2026-10-09T00:00:00.000Z')

function subscriber(
  entitlementOverrides: Record<string, unknown> = {},
  subscriptionOverrides: Record<string, unknown> = {},
) {
  return {
    subscriber: {
      entitlements: {
        airi_go: {
          expires_date: '2026-11-09T00:00:00.000Z',
          product_identifier: 'rc_go_monthly',
          ...entitlementOverrides,
        },
      },
      subscriptions: {
        rc_go_monthly: {
          billing_issues_detected_at: null as string | null,
          unsubscribe_detected_at: null as string | null,
          store: 'app_store',
          is_sandbox: true,
          ...subscriptionOverrides,
        },
      },
    },
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function createStatus(fetchImpl: typeof fetch, redis: Redis = createTestRedis()) {
  return {
    redis,
    status: createRevenuecatStatus({
      apiKey: 'secret',
      redis,
      fetch: fetchImpl,
      now: () => now,
    }),
  }
}

describe('revenuecat status', () => {
  it('reads an active entitlement and caches it', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(subscriber()))
    const { status } = createStatus(fetchImpl)

    const first = await status.read('user-1')
    const second = await status.read('user-1')

    expect(first).toEqual([{
      entitlementId: 'airi_go',
      productId: 'rc_go_monthly',
      store: 'app_store',
      environment: 'SANDBOX',
      status: 'active',
      expiresAt: '2026-11-09T00:00:00.000Z',
    }])
    expect(second).toEqual(first)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('marks a cancelled entitlement and a billing issue', async () => {
    const cancelled = subscriber({}, { unsubscribe_detected_at: '2026-10-01T00:00:00.000Z' })
    const { status: cancelledStatus } = createStatus(vi.fn(async () => jsonResponse(cancelled)))
    expect((await cancelledStatus.read('user-1'))[0]?.status).toBe('cancelled')

    const pastDue = subscriber({}, {
      billing_issues_detected_at: '2026-10-02T00:00:00.000Z',
      unsubscribe_detected_at: '2026-10-01T00:00:00.000Z',
    })
    const { status: pastDueStatus } = createStatus(vi.fn(async () => jsonResponse(pastDue)))
    expect((await pastDueStatus.read('user-2'))[0]?.status).toBe('past_due')
  })

  it('omits an expired entitlement and keeps grace access', async () => {
    const expired = subscriber({ expires_date: '2026-10-01T00:00:00.000Z' })
    const { status: expiredStatus } = createStatus(vi.fn(async () => jsonResponse(expired)))
    expect(await expiredStatus.read('user-1')).toEqual([])

    const grace = subscriber({
      expires_date: '2026-10-01T00:00:00.000Z',
      grace_period_expires_date: '2026-10-16T00:00:00.000Z',
    })
    const { status: graceStatus } = createStatus(vi.fn(async () => jsonResponse(grace)))
    expect(await graceStatus.read('user-1')).toMatchObject([{
      status: 'active',
      expiresAt: '2026-10-16T00:00:00.000Z',
    }])
  })

  it('treats an unknown subscriber as no entitlements', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: 'not found' }, 404))
    const { status } = createStatus(fetchImpl)
    expect(await status.read('user-1')).toEqual([])
    expect(await status.read('user-1')).toEqual([])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('refetches after invalidation', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(subscriber()))
    const { redis, status } = createStatus(fetchImpl)
    await status.read('user-1')
    await status.invalidate('user-1')
    expect(await redis.get(userSubscriptionStatusRedisKey('user-1'))).toBeNull()
    await status.read('user-1')
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('returns 503 when the API key is unset', async () => {
    const status = createRevenuecatStatus({
      apiKey: null,
      redis: createTestRedis(),
      fetch: vi.fn(),
    })
    await expect(status.read('user-1')).rejects.toBeInstanceOf(ApiError)
    await expect(status.read('user-1')).rejects.toMatchObject({ statusCode: 503 })
  })

  it('returns 502 when RevenueCat rejects the request', async () => {
    const status = createRevenuecatStatus({
      apiKey: 'secret',
      redis: createTestRedis(),
      fetch: vi.fn(async () => jsonResponse({ message: 'no' }, 500)),
      now: () => now,
    })
    await expect(status.read('user-1')).rejects.toMatchObject({ statusCode: 502 })
  })
})

import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../utils/error'
import { createRevenuecatSubscriberClient } from './revenuecat-subscriber'

function jsonFetch(body: unknown, status = 200) {
  return vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify(body), { status }))
}

async function statusOf(run: Promise<unknown>): Promise<number | null> {
  try {
    await run
    return null
  }
  catch (error) {
    return error instanceof ApiError ? error.statusCode : null
  }
}

describe('revenuecat subscriber client', () => {
  it('reads entitlements with the secret key', async () => {
    const fetch = jsonFetch({
      subscriber: {
        entitlements: {
          airi_go: {
            expires_date: '2026-11-01T00:00:00Z',
            grace_period_expires_date: null,
            product_identifier: 'rc_go_monthly',
            purchase_date: '2026-10-01T00:00:00Z',
          },
        },
      },
    })
    const client = createRevenuecatSubscriberClient({ apiKey: 'sk_test', fetch })

    expect(await client.fetchEntitlements('user/1')).toEqual([{
      entitlementId: 'airi_go',
      productId: 'rc_go_monthly',
      purchasedAt: new Date('2026-10-01T00:00:00Z'),
      accessUntil: new Date('2026-11-01T00:00:00Z'),
    }])
    expect(fetch).toHaveBeenCalledWith(
      'https://api.revenuecat.com/v1/subscribers/user%2F1',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer sk_test' }) }),
    )
  })

  it('extends access through the grace period', async () => {
    const client = createRevenuecatSubscriberClient({
      apiKey: 'sk_test',
      fetch: jsonFetch({
        subscriber: {
          entitlements: {
            airi_go: {
              expires_date: '2026-11-01T00:00:00Z',
              grace_period_expires_date: '2026-11-08T00:00:00Z',
              product_identifier: 'rc_go_monthly',
              purchase_date: '2026-10-01T00:00:00Z',
            },
          },
        },
      }),
    })

    const [entitlement] = await client.fetchEntitlements('user-1')
    expect(entitlement?.accessUntil).toEqual(new Date('2026-11-08T00:00:00Z'))
  })

  it('reads an entitlement that does not expire', async () => {
    const client = createRevenuecatSubscriberClient({
      apiKey: 'sk_test',
      fetch: jsonFetch({
        subscriber: {
          entitlements: {
            airi_go: {
              expires_date: null,
              product_identifier: 'rc_go_lifetime',
              purchase_date: '2026-10-01T00:00:00Z',
            },
          },
        },
      }),
    })

    const [entitlement] = await client.fetchEntitlements('user-1')
    expect(entitlement?.accessUntil).toBeNull()
  })

  it('returns no entitlements for a new customer', async () => {
    const client = createRevenuecatSubscriberClient({
      apiKey: 'sk_test',
      fetch: jsonFetch({ subscriber: { entitlements: {} } }, 201),
    })
    expect(await client.fetchEntitlements('user-1')).toEqual([])
  })

  it('fails with 503 when the key is unset', async () => {
    const fetch = jsonFetch({})
    const client = createRevenuecatSubscriberClient({ apiKey: null, fetch })

    expect(await statusOf(client.fetchEntitlements('user-1'))).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails with 502 on an upstream error', async () => {
    const client = createRevenuecatSubscriberClient({ apiKey: 'sk_test', fetch: jsonFetch({}, 500) })
    expect(await statusOf(client.fetchEntitlements('user-1'))).toBe(502)
  })

  it('fails with 502 on a response that does not match the contract', async () => {
    const client = createRevenuecatSubscriberClient({
      apiKey: 'sk_test',
      fetch: jsonFetch({ subscriber: { entitlements: { airi_go: { product_identifier: 'rc_go_monthly' } } } }),
    })
    expect(await statusOf(client.fetchEntitlements('user-1'))).toBe(502)
  })
})

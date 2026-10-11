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
        subscriptions: {},
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
    const client = createRevenuecatSubscriberClient({ apiKey: 'sk_test', sellsSubscriptions: true, fetch })

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
      sellsSubscriptions: true,
      fetch: jsonFetch({
        subscriber: {
          subscriptions: {},
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
      sellsSubscriptions: true,
      fetch: jsonFetch({
        subscriber: {
          subscriptions: {},
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
      sellsSubscriptions: true,
      fetch: jsonFetch({ subscriber: { entitlements: {}, subscriptions: {} } }, 201),
    })
    expect(await client.fetchEntitlements('user-1')).toEqual([])
  })

  it('fails with 503 when the key is unset', async () => {
    const fetch = jsonFetch({})
    const client = createRevenuecatSubscriberClient({ apiKey: null, sellsSubscriptions: true, fetch })

    expect(await statusOf(client.fetchEntitlements('user-1'))).toBe(503)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails with 502 on an upstream error', async () => {
    const client = createRevenuecatSubscriberClient({ apiKey: 'sk_test', sellsSubscriptions: true, fetch: jsonFetch({ subscriber: { entitlements: {}, subscriptions: {} } }, 500) })
    expect(await statusOf(client.fetchEntitlements('user-1'))).toBe(502)
  })

  it('fails with 502 on a response that does not match the contract', async () => {
    const client = createRevenuecatSubscriberClient({
      apiKey: 'sk_test',
      sellsSubscriptions: true,
      fetch: jsonFetch({ subscriber: { entitlements: { airi_go: { product_identifier: 'rc_go_monthly' } } } }),
    })
    expect(await statusOf(client.fetchEntitlements('user-1'))).toBe(502)
  })

  describe('hasRenewingSubscription', () => {
    const hour = 3_600_000
    const day = 24 * hour
    const soon = new Date(Date.now() + hour).toISOString()
    const earlier = new Date(Date.now() - hour).toISOString()
    const subscription = {
      expires_date: soon,
      grace_period_expires_date: null,
      unsubscribe_detected_at: null,
      billing_issues_detected_at: null,
      refunded_at: null,
    }

    function renewing(subscriptions: Record<string, unknown>) {
      const fetch = jsonFetch({ subscriber: { entitlements: {}, subscriptions } })
      return createRevenuecatSubscriberClient({ apiKey: 'sk_test', sellsSubscriptions: true, fetch }).hasRenewingSubscription('user-1')
    }

    it('is true while a subscription gives access and the renewal is on', async () => {
      expect(await renewing({ rc_go_monthly: subscription })).toBe(true)
      expect(await renewing({ rc_go_monthly: { ...subscription, expires_date: earlier, grace_period_expires_date: soon } })).toBe(true)
    })

    it('is false for a cancelled, refunded, or expired subscription and for no subscription', async () => {
      expect(await renewing({ rc_go_monthly: { ...subscription, unsubscribe_detected_at: earlier } })).toBe(false)
      expect(await renewing({ rc_go_monthly: { ...subscription, refunded_at: earlier } })).toBe(false)
      expect(await renewing({ rc_go_monthly: { ...subscription, expires_date: earlier } })).toBe(false)
      expect(await renewing({})).toBe(false)
    })

    // https://github.com/moeru-ai/airi/pull/2910#discussion_r4239058361
    // ROOT CAUSE:
    //
    // The rule read "gives access" as "renews". A failed renewal without a grace period expires
    // the subscription at once, but RevenueCat retries the payment for up to 30 days.
    //
    // An expired subscription now counts while its payment retry window is open.
    it('is true for an expired subscription while the store retries a failed payment', async () => {
      const failed = { ...subscription, expires_date: earlier, billing_issues_detected_at: earlier }
      expect(await renewing({ rc_go_monthly: failed })).toBe(true)
      expect(await renewing({ rc_go_monthly: { ...failed, unsubscribe_detected_at: earlier } })).toBe(false)

      const afterRetries = new Date(Date.now() - 31 * day).toISOString()
      expect(await renewing({ rc_go_monthly: { ...failed, expires_date: afterRetries, billing_issues_detected_at: afterRetries } })).toBe(false)
    })

    it('is false without a read in a deployment that sells no subscriptions', async () => {
      const fetch = jsonFetch({})
      expect(await createRevenuecatSubscriberClient({ apiKey: null, sellsSubscriptions: false, fetch }).hasRenewingSubscription('user-1')).toBe(false)
      expect(fetch).not.toHaveBeenCalled()
    })

    // https://github.com/moeru-ai/airi/pull/2910#discussion_r4239058365
    it('fails without an API key in a deployment that sells subscriptions', async () => {
      const client = createRevenuecatSubscriberClient({ apiKey: null, sellsSubscriptions: true, fetch: jsonFetch({}) })
      expect(await statusOf(client.hasRenewingSubscription('user-1'))).toBe(503)
    })

    it('fails when RevenueCat cannot be read, so the deletion stops', async () => {
      const client = createRevenuecatSubscriberClient({ apiKey: 'sk_test', sellsSubscriptions: true, fetch: jsonFetch({}, 500) })
      expect(await statusOf(client.hasRenewingSubscription('user-1'))).toBe(502)
    })
  })
})

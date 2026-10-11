import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../utils/error'
import { createRevenuecatSubscriberClient } from './revenuecat-subscriber'

const periodStart = Date.parse('2026-10-01T00:00:00Z')
const periodEnd = Date.parse('2026-11-01T00:00:00Z')

const goSubscription = {
  product_id: 'prod_go',
  status: 'active',
  auto_renewal_status: 'will_renew',
  gives_access: true,
  current_period_starts_at: periodStart,
  entitlements: { items: [{ id: 'entl_go', lookup_key: 'airi_go' }] },
}

/** What RevenueCat holds for one customer. A missing customer answers 404, as RevenueCat does. */
interface Customer {
  subscriptions: unknown[]
  activeEntitlements?: { entitlement_id: string, expires_at: number | null }[]
}

const products: Record<string, string> = { prod_go: 'rc_go_monthly', prod_plus: 'rc_plus_monthly' }

/** A RevenueCat API v2 that serves one customer. It records each request path. */
function revenuecat(customer: Customer | null) {
  const paths: string[] = []
  const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
    const url = new URL(String(input))
    paths.push(url.pathname.replace('/v2/projects/proj1', '') + url.search)
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
    const product = url.pathname.match(/\/products\/(.+)$/)
    if (product)
      return json({ id: product[1], store_identifier: products[product[1]!] })
    if (customer === null)
      return new Response('{}', { status: 404 })
    if (url.pathname.endsWith('/active_entitlements'))
      return json({ items: customer.activeEntitlements ?? [], next_page: null })
    // The list has one item for each page, so a test with two subscriptions needs the second page.
    const index = Number(url.searchParams.get('page') ?? 0)
    // The second page is a path, and the third is an absolute URL. RevenueCat documents one and returns the other.
    const nextPath = `${url.pathname}?page=${index + 1}`
    const next = index + 1 < customer.subscriptions.length ? (index === 0 ? nextPath : `${url.origin}${nextPath}`) : null
    return json({ items: customer.subscriptions.slice(index, index + 1), next_page: next })
  })
  const client = createRevenuecatSubscriberClient({ apiKey: 'sk_v2', projectId: 'proj1', sellsSubscriptions: true, fetch })
  return { client, fetch, paths }
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
  describe('fetchEntitlements', () => {
    it('joins the subscription, the active entitlement, and the product', async () => {
      const { client, fetch, paths } = revenuecat({
        subscriptions: [goSubscription],
        activeEntitlements: [{ entitlement_id: 'entl_go', expires_at: periodEnd }],
      })

      expect(await client.fetchEntitlements('user/1')).toEqual([{
        entitlementId: 'airi_go',
        productId: 'rc_go_monthly',
        purchasedAt: new Date(periodStart),
        accessUntil: new Date(periodEnd),
      }])
      expect(paths).toEqual([
        '/customers/user%2F1/subscriptions?limit=100',
        '/customers/user%2F1/active_entitlements?limit=100',
        '/products/prod_go',
      ])
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer sk_v2' }) }),
      )
    })

    it('reads every page and skips a subscription that gives no access', async () => {
      const expired = { ...goSubscription, status: 'expired', auto_renewal_status: 'will_not_renew', gives_access: false }
      const plus = { ...goSubscription, product_id: 'prod_plus', entitlements: { items: [{ id: 'entl_plus', lookup_key: 'airi_plus' }] } }
      const { client, paths } = revenuecat({
        subscriptions: [expired, plus],
        activeEntitlements: [{ entitlement_id: 'entl_plus', expires_at: periodEnd }],
      })

      const entitlements = await client.fetchEntitlements('user-1')

      expect(entitlements.map(item => [item.entitlementId, item.productId])).toEqual([['airi_plus', 'rc_plus_monthly']])
      expect(paths).not.toContain('/products/prod_go')
    })

    // https://github.com/moeru-ai/airi/pull/2910#discussion_r4240813205
    it('grants nothing for a promotional subscription, which has no product', async () => {
      const promotional = { ...goSubscription, product_id: null }
      const { client, paths } = revenuecat({
        subscriptions: [promotional],
        activeEntitlements: [{ entitlement_id: 'entl_go', expires_at: periodEnd }],
      })

      expect(await client.fetchEntitlements('user-1')).toEqual([])
      expect(paths.filter(path => path.startsWith('/products'))).toEqual([])
    })

    it('takes the later billing period when two subscriptions grant one entitlement', async () => {
      const later = { ...goSubscription, current_period_starts_at: periodStart + 1000 }
      const { client } = revenuecat({
        subscriptions: [goSubscription, later],
        activeEntitlements: [{ entitlement_id: 'entl_go', expires_at: periodEnd }],
      })

      const entitlements = await client.fetchEntitlements('user-1')

      expect(entitlements).toHaveLength(1)
      expect(entitlements[0]!.purchasedAt).toEqual(new Date(periodStart + 1000))
    })

    it('returns nothing for a customer that RevenueCat does not know, and for no subscription', async () => {
      expect(await revenuecat(null).client.fetchEntitlements('user-1')).toEqual([])
      expect(await revenuecat({ subscriptions: [] }).client.fetchEntitlements('user-1')).toEqual([])
    })

    it('fails with 503 without a key or a project id', async () => {
      const fetch = vi.fn<typeof globalThis.fetch>()
      const noKey = createRevenuecatSubscriberClient({ apiKey: null, projectId: 'proj1', sellsSubscriptions: true, fetch })
      const noProject = createRevenuecatSubscriberClient({ apiKey: 'sk_v2', projectId: null, sellsSubscriptions: true, fetch })

      expect(await statusOf(noKey.fetchEntitlements('user-1'))).toBe(503)
      expect(await statusOf(noProject.fetchEntitlements('user-1'))).toBe(503)
      expect(fetch).not.toHaveBeenCalled()
    })

    it('fails with 502 on an upstream error, an invalid body, and a network error', async () => {
      const client = (fetch: typeof globalThis.fetch) =>
        createRevenuecatSubscriberClient({ apiKey: 'sk_v2', projectId: 'proj1', sellsSubscriptions: true, fetch })

      expect(await statusOf(client(async () => new Response('{}', { status: 500 })).fetchEntitlements('user-1'))).toBe(502)
      expect(await statusOf(client(async () => new Response('{"items":[{}],"next_page":null}')).fetchEntitlements('user-1'))).toBe(502)
      expect(await statusOf(client(async () => new Response('not json')).fetchEntitlements('user-1'))).toBe(502)
      expect(await statusOf(client(async () => {
        throw new TypeError('fetch failed')
      }).fetchEntitlements('user-1'))).toBe(502)
    })
  })

  describe('hasRenewingSubscription', () => {
    const renewing = (subscription: object) =>
      revenuecat({ subscriptions: [{ ...goSubscription, ...subscription }] }).client.hasRenewingSubscription('user-1')

    it('is true while the store renews the subscription', async () => {
      expect(await renewing({})).toBe(true)
      expect(await renewing({ status: 'trialing' })).toBe(true)
      expect(await renewing({ status: 'in_grace_period' })).toBe(true)
    })

    // https://github.com/moeru-ai/airi/pull/2910#discussion_r4239058361
    // ROOT CAUSE:
    //
    // The v1 rule read "gives access" as "renews". A failed renewal without a grace period ends
    // the access at once, but RevenueCat retries the payment for up to 30 days.
    //
    // The v2 status `in_billing_retry` names this case, so it counts.
    it('is true while the store retries a failed payment, without access', async () => {
      expect(await renewing({ status: 'in_billing_retry', gives_access: false })).toBe(true)
    })

    it('is false for a cancelled subscription that still gives access, and for an ended one', async () => {
      expect(await renewing({ auto_renewal_status: 'will_not_renew' })).toBe(false)
      expect(await renewing({ status: 'expired', gives_access: false })).toBe(false)
      expect(await revenuecat({ subscriptions: [] }).client.hasRenewingSubscription('user-1')).toBe(false)
      expect(await revenuecat(null).client.hasRenewingSubscription('user-1')).toBe(false)
    })

    // https://github.com/moeru-ai/airi/pull/2910#discussion_r4240813197
    it('is true for an unknown status while the renewal is on', async () => {
      expect(await renewing({ status: 'unknown', gives_access: false })).toBe(true)
      expect(await renewing({ status: 'unknown', auto_renewal_status: 'will_not_renew' })).toBe(false)
    })

    // https://github.com/moeru-ai/airi/pull/2910#discussion_r4240813200
    it('finds a renewing subscription on a later page, for a path and for an absolute URL', async () => {
      const expired = { ...goSubscription, status: 'expired', auto_renewal_status: 'will_not_renew', gives_access: false }

      expect(await revenuecat({ subscriptions: [expired, goSubscription] }).client.hasRenewingSubscription('user-1')).toBe(true)
      expect(await revenuecat({ subscriptions: [expired, expired, goSubscription] }).client.hasRenewingSubscription('user-1')).toBe(true)
    })

    it('is false without a read in a deployment that sells no subscriptions', async () => {
      const fetch = vi.fn<typeof globalThis.fetch>()
      const client = createRevenuecatSubscriberClient({ apiKey: null, projectId: null, sellsSubscriptions: false, fetch })

      expect(await client.hasRenewingSubscription('user-1')).toBe(false)
      expect(fetch).not.toHaveBeenCalled()
    })

    // https://github.com/moeru-ai/airi/pull/2910#discussion_r4239058365
    it('fails without a configuration in a deployment that sells subscriptions', async () => {
      const client = createRevenuecatSubscriberClient({ apiKey: null, projectId: null, sellsSubscriptions: true, fetch: vi.fn<typeof globalThis.fetch>() })

      expect(await statusOf(client.hasRenewingSubscription('user-1'))).toBe(503)
    })

    it('fails when RevenueCat cannot be read, so the deletion stops', async () => {
      const client = createRevenuecatSubscriberClient({
        apiKey: 'sk_v2',
        projectId: 'proj1',
        sellsSubscriptions: true,
        fetch: async () => new Response('{}', { status: 500 }),
      })

      expect(await statusOf(client.hasRenewingSubscription('user-1'))).toBe(502)
    })
  })
})

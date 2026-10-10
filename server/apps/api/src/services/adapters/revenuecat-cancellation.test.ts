import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../utils/error'
import { createRevenuecatCancellation } from './revenuecat-cancellation'

const subscription = { id: 'sub_1', store: 'rc_billing', gives_access: true, auto_renewal_status: 'will_renew' }

/** Answers the list request with `items` and each cancel request with `cancelStatus`. */
function revenuecat(items: unknown[], cancelStatus = 200) {
  return vi.fn<typeof globalThis.fetch>(async (_url, init) => init?.method === 'POST'
    ? new Response('{}', { status: cancelStatus })
    : new Response(JSON.stringify({ object: 'list', items }), { status: 200 }))
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

describe('revenuecat cancellation', () => {
  // https://github.com/moeru-ai/airi/pull/2813#discussion_r4238519371
  // ROOT CAUSE:
  //
  // Account deletion removed the identity and left the Web Billing subscription active.
  // The deleted user could not open the management URL, so the subscription renewed.
  //
  // The deletion now cancels each renewing Web Billing subscription first.
  it('cancels each Web Billing subscription that still renews', async () => {
    const fetch = revenuecat([
      subscription,
      { ...subscription, id: 'sub_cancelled', auto_renewal_status: 'will_not_renew' },
      { ...subscription, id: 'sub_expired', gives_access: false },
      { ...subscription, id: 'sub_apple', store: 'app_store' },
    ])
    const cancellation = createRevenuecatCancellation({ apiKey: 'sk_v2', projectId: 'proj1', fetch })

    expect(await cancellation.cancelRenewals('user/1')).toEqual(['sub_1'])
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.revenuecat.com/v2/projects/proj1/customers/user%2F1/subscriptions?limit=100',
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer sk_v2' }) }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://api.revenuecat.com/v2/projects/proj1/subscriptions/sub_1/actions/cancel',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('cancels nothing for a user who is not a RevenueCat customer', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('{}', { status: 404 }))
    const cancellation = createRevenuecatCancellation({ apiKey: 'sk_v2', projectId: 'proj1', fetch })

    expect(await cancellation.cancelRenewals('user-1')).toEqual([])
  })

  it('reads nothing when API v2 is not configured', async () => {
    const fetch = revenuecat([subscription])

    expect(await createRevenuecatCancellation({ apiKey: null, projectId: 'proj1', fetch }).cancelRenewals('user-1')).toEqual([])
    expect(await createRevenuecatCancellation({ apiKey: 'sk_v2', projectId: null, fetch }).cancelRenewals('user-1')).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('fails when RevenueCat rejects the cancel, so the deletion stops', async () => {
    const cancellation = createRevenuecatCancellation({ apiKey: 'sk_v2', projectId: 'proj1', fetch: revenuecat([subscription], 500) })

    expect(await statusOf(cancellation.cancelRenewals('user-1'))).toBe(502)
  })

  it('fails on a list error and on an invalid list', async () => {
    const failed = vi.fn<typeof globalThis.fetch>(async () => new Response('{}', { status: 500 }))
    const invalid = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ items: [{ id: 1 }] }), { status: 200 }))

    expect(await statusOf(createRevenuecatCancellation({ apiKey: 'sk_v2', projectId: 'proj1', fetch: failed }).cancelRenewals('user-1'))).toBe(502)
    expect(await statusOf(createRevenuecatCancellation({ apiKey: 'sk_v2', projectId: 'proj1', fetch: invalid }).cancelRenewals('user-1'))).toBe(502)
  })
})

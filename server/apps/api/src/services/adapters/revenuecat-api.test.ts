import { describe, expect, it, vi } from 'vitest'

import { createRevenuecatApiClient } from './revenuecat-api'

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

describe('revenuecat-api', () => {
  it('stays disabled without secret and project', async () => {
    const fetchFn = vi.fn()
    const api = createRevenuecatApiClient({ apiSecret: null, projectId: null }, fetchFn)

    expect(api.enabled).toBe(false)
    expect(await api.getActiveEntitlements('user-1')).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('maps internal entitlement ids to lookup keys', async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes('/entitlements')) {
        return jsonResponse({
          object: 'list',
          items: [{ id: 'ent1', lookup_key: 'airi_go' }],
          next_page: null,
        })
      }
      return jsonResponse({
        active_entitlements: {
          object: 'list',
          items: [{ object: 'customer.active_entitlement', entitlement_id: 'ent1', expires_at: 1790800000000 }],
        },
      })
    })
    const api = createRevenuecatApiClient({ apiSecret: 'sk', projectId: 'proj' }, fetchFn as typeof fetch)

    expect(await api.getActiveEntitlements('user-1')).toEqual([
      { lookupKey: 'airi_go', expiresAtMs: 1790800000000 },
    ])
  })

  it('reconciles unknown customers as empty', async () => {
    const fetchFn = vi.fn(async () => new Response('null', { status: 404 }))
    const api = createRevenuecatApiClient({ apiSecret: 'sk', projectId: 'proj' }, fetchFn as typeof fetch)

    expect(await api.getActiveEntitlements('ghost')).toEqual([])
  })

  it('skips reconcile on malformed payloads', async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ active_entitlements: { items: [{ nope: 1 }] } }))
    const api = createRevenuecatApiClient({ apiSecret: 'sk', projectId: 'proj' }, fetchFn as typeof fetch)

    expect(await api.getActiveEntitlements('user-1')).toBeNull()
  })
})

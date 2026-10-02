import { useLogger } from '@guiiai/logg'
import { array, nullable, number, object, optional, safeParse, string } from 'valibot'

const logger = useLogger('revenuecat-api')

const customerSchema = object({
  active_entitlements: optional(nullable(object({
    items: optional(nullable(array(object({
      entitlement_id: string(),
      expires_at: optional(nullable(number())),
    })))),
  }))),
})

const entitlementsSchema = object({
  items: optional(nullable(array(object({
    id: string(),
    lookup_key: optional(nullable(string())),
  })))),
  next_page: optional(nullable(string())),
})

export interface RemoteEntitlement {
  lookupKey: string
  expiresAtMs: number | null
}

export interface RevenuecatApiConfig {
  apiSecret: string | null
  projectId: string | null
}

type FetchFn = typeof fetch

/**
 * Minimal RevenueCat Developer API v2 client for lazy reconciliation.
 * Reads the canonical entitlement state; never grants quota by itself —
 * the subscription service decides what a difference means.
 */
export function createRevenuecatApiClient(config: RevenuecatApiConfig, fetchFn: FetchFn = fetch) {
  const enabled = config.apiSecret != null && config.projectId != null
  let entitlementMap: { fetchedAt: number, byId: Map<string, string> } | null = null

  async function request(path: string): Promise<{ status: number, json: unknown } | null> {
    if (!enabled)
      return null
    let res: Response
    try {
      res = await fetchFn(`https://api.revenuecat.com/v2/projects/${config.projectId}${path}`, {
        headers: { Authorization: `Bearer ${config.apiSecret}` },
      })
    }
    catch (error) {
      logger.withError(error).warn('RevenueCat API request failed')
      return null
    }
    if (res.status === 404)
      return { status: 404, json: null }
    if (!res.ok) {
      logger.withFields({ status: res.status, path }).warn('RevenueCat API request rejected')
      return null
    }
    try {
      return { status: res.status, json: await res.json() }
    }
    catch {
      return null
    }
  }

  async function lookupKeysById(): Promise<Map<string, string> | null> {
    if (!enabled)
      return null
    if (entitlementMap && Date.now() - entitlementMap.fetchedAt < 60 * 60 * 1000)
      return entitlementMap.byId

    // The entitlement list is paginated; cap the walk so a runaway cursor cannot stall reconciliation.
    const MAX_PAGES = 10
    const byId = new Map<string, string>()
    let cursor: string | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await request(`/entitlements${cursor ? `?starting_after=${encodeURIComponent(cursor)}` : ''}`)
      if (!response || response.status === 404)
        return null
      const parsed = safeParse(entitlementsSchema, response.json)
      if (!parsed.success)
        return null
      const items = parsed.output.items ?? []
      for (const item of items) {
        if (item.lookup_key)
          byId.set(item.id, item.lookup_key)
      }
      const next = parsed.output.next_page
      if (!next)
        break
      try {
        cursor = new URL(next, 'https://api.revenuecat.com').searchParams.get('starting_after')
      }
      catch {
        break
      }
      if (!cursor)
        break
    }

    entitlementMap = { fetchedAt: Date.now(), byId }
    return byId
  }

  return {
    enabled,

    /**
     * Returns canonical active entitlements keyed by dashboard lookup key
     * (`airi_go`), or null when reconciliation must be skipped. Unknown
     * customers (404) reconcile as empty, which only expires already-lapsed
     * local rows.
     */
    async getActiveEntitlements(appUserId: string): Promise<RemoteEntitlement[] | null> {
      const response = await request(`/customers/${encodeURIComponent(appUserId)}`)
      if (!response)
        return null
      if (response.status === 404)
        return []

      const parsed = safeParse(customerSchema, response.json)
      if (!parsed.success)
        return null
      const items = parsed.output.active_entitlements?.items ?? []
      if (items.length === 0)
        return []

      const byId = await lookupKeysById()
      if (!byId)
        return null

      const remote: RemoteEntitlement[] = []
      for (const item of items) {
        const lookupKey = byId.get(item.entitlement_id) ?? item.entitlement_id
        remote.push({ lookupKey, expiresAtMs: item.expires_at ?? null })
      }
      return remote
    },
  }
}

export type RevenuecatApiClient = ReturnType<typeof createRevenuecatApiClient>

import type { Package } from '@revenuecat/purchases-js'

import { getRevenuecatWebKey } from '@proj-airi/stage-shared'

/** Delay between polls while waiting for the webhook grant to land. */
export const REVENUECAT_POLL_INTERVAL_MS = 3000
/** Webhook grants usually land within a minute; stop polling after this many tries. */
export const REVENUECAT_POLL_MAX_ATTEMPTS = 20

let configuredKey: string | null = null
let configuredUserId: string | null = null

/**
 * Returns the shared Purchases instance for the current web key and user.
 * Re-keys the client when either changes so concurrent accounts never share identity.
 */
export async function ensureRevenuecatConfigured(userId: string) {
  const key = getRevenuecatWebKey()
  if (!key)
    throw new Error('REVENUECAT_WEB_KEY_MISSING')

  const { Purchases } = await import('@revenuecat/purchases-js')
  if (!Purchases.isConfigured()) {
    Purchases.configure({ apiKey: key, appUserId: userId })
    configuredKey = key
    configuredUserId = userId
    return Purchases.getSharedInstance()
  }

  const purchases = Purchases.getSharedInstance()
  if (configuredKey !== key || configuredUserId !== userId) {
    await purchases.changeUser(userId)
    configuredKey = key
    configuredUserId = userId
  }
  return purchases
}

export function revenuecatPackagePrice(pkg: Package): { formattedPrice: string, currency: string } {
  const price = pkg.webBillingProduct.price ?? pkg.webBillingProduct.currentPrice
  return { formattedPrice: price.formattedPrice, currency: price.currency }
}

/** A user-cancelled checkout is a normal outcome, not an error. */
export async function isRevenuecatUserCancelled(error: unknown): Promise<boolean> {
  const { ErrorCode, PurchasesError } = await import('@revenuecat/purchases-js')
  return error instanceof PurchasesError && error.errorCode === ErrorCode.UserCancelledError
}

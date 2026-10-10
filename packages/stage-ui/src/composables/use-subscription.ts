import type { CustomerInfo, Package } from '@revenuecat/purchases-js'

import { getRevenuecatWebKey, isFluxPurchaseDisabled } from '@proj-airi/stage-shared'
import { ErrorCode, Purchases, PurchasesError } from '@revenuecat/purchases-js'
import { object, optional, pipe, record, safeParse, string, trim } from 'valibot'
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { client } from './api'

let configuredKey: string | null = null
let configuredUserId: string | null = null

/**
 * Returns the shared Purchases instance for the current web key and user.
 * Re-keys the client when either changes so concurrent accounts never share identity.
 */
async function ensurePurchases(userId: string) {
  const key = getRevenuecatWebKey()
  if (!key)
    throw new Error('REVENUECAT_WEB_KEY_MISSING')

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

export interface CurrentCapacitor {
  entitlementId: string
  productId: string
  expiresAt: string | null
  willRenew: boolean
}

export interface CapacitorPackage {
  packageId: string
  productId: string
  name: string | null
  benefit: string | null
  formattedPrice: string
  amountMicros: number
}

export interface CapacitorCatalogCopy {
  name: string | null
  benefit: string | null
}

const capacitorListingSchema = object({
  name: optional(pipe(string(), trim())),
  benefit: optional(pipe(string(), trim())),
})

const capacitorMetadataSchema = object({
  capacitors: optional(record(string(), record(string(), capacitorListingSchema))),
})

const emptyCapacitorCatalogCopy: CapacitorCatalogCopy = { name: null, benefit: null }

/** Reads one product's name and benefit from offering metadata with English fallback. */
export function capacitorCatalogCopy(metadata: unknown, productId: string, locale: string): CapacitorCatalogCopy {
  const parsed = safeParse(capacitorMetadataSchema, metadata ?? {})
  if (!parsed.success || !parsed.output.capacitors)
    return emptyCapacitorCatalogCopy
  const listing = parsed.output.capacitors[locale]?.[productId] ?? parsed.output.capacitors.en?.[productId]
  if (!listing)
    return emptyCapacitorCatalogCopy
  return {
    name: listing.name || null,
    benefit: listing.benefit || null,
  }
}

interface CapacitorEntitlement {
  identifier: string
  productIdentifier: string
  expirationDate: Date | null
  willRenew: boolean
}

/**
 * Picks the active entitlement that lasts longest.
 * A lifetime entitlement has no expiry and outranks a dated one.
 */
export function currentCapacitorFromCustomerInfo(info: {
  entitlements: { active: Record<string, CapacitorEntitlement> }
}): CurrentCapacitor | null {
  const active = Object.values(info.entitlements.active)
  const chosen = active.reduce<typeof active[number] | null>((best, item) => {
    if (!best)
      return item
    const bestExpiry = best.expirationDate?.getTime() ?? Number.POSITIVE_INFINITY
    const itemExpiry = item.expirationDate?.getTime() ?? Number.POSITIVE_INFINITY
    return itemExpiry > bestExpiry ? item : best
  }, null)
  if (!chosen)
    return null
  return {
    entitlementId: chosen.identifier,
    productId: chosen.productIdentifier,
    expiresAt: chosen.expirationDate?.toISOString() ?? null,
    willRenew: chosen.willRenew,
  }
}

/** Capacitors are sold by the month only. Packages with another billing period are not listed. */
function toCapacitorPackage(pkg: Package, metadata: unknown, locale: string): CapacitorPackage | null {
  if (pkg.webBillingProduct.period?.unit !== 'month')
    return null
  const price = pkg.webBillingProduct.price
  const copy = capacitorCatalogCopy(metadata, pkg.webBillingProduct.identifier, locale)
  return {
    packageId: pkg.identifier,
    productId: pkg.webBillingProduct.identifier,
    name: copy.name,
    benefit: copy.benefit,
    formattedPrice: price.formattedPrice,
    amountMicros: price.amountMicros,
  }
}

/** Capacitor subscriptions through RevenueCat Web Billing. The SDK reports the capacitor. The webhook grants capacitor Flux. */
export function useSubscription(options: {
  getUserId: () => string
  onChanged: () => Promise<unknown>
}) {
  const { t, locale } = useI18n()
  const enabled = !isFluxPurchaseDisabled() && getRevenuecatWebKey() != null

  const currentCapacitor = ref<CurrentCapacitor | null>(null)
  const packages = ref<CapacitorPackage[]>([])
  const purchasingPackageId = ref<string | null>(null)
  const managementUrl = ref<string | null>(null)

  function applyCustomerInfo(info: CustomerInfo) {
    currentCapacitor.value = currentCapacitorFromCustomerInfo(info)
    managementUrl.value = info.managementURL
  }

  async function refreshCustomer(): Promise<void> {
    if (!enabled)
      return
    const purchases = await ensurePurchases(options.getUserId())
    applyCustomerInfo(await purchases.getCustomerInfo())
  }

  /** Reads the capacitor from the SDK, then refreshes the balance, which carries the capacitor percent. */
  async function fetchStatus(): Promise<void> {
    await refreshCustomer().catch(() => undefined)
    await options.onChanged().catch(() => undefined)
  }

  async function fetchPackages(): Promise<void> {
    packages.value = []
    if (!enabled)
      return
    const purchases = await ensurePurchases(options.getUserId())
    const offerings = await purchases.getOfferings()
    const current = offerings.current
    if (!current)
      return
    packages.value = current.availablePackages.flatMap((pkg) => {
      const capacitorPackage = toCapacitorPackage(pkg, current.metadata, locale.value)
      return capacitorPackage ? [capacitorPackage] : []
    })
  }

  async function purchaseCapacitor(packageId: string): Promise<'activated' | 'pending' | 'cancelled'> {
    purchasingPackageId.value = packageId
    try {
      const purchases = await ensurePurchases(options.getUserId())
      const offerings = await purchases.getOfferings()
      const rcPackage = offerings.current?.availablePackages.find(pkg => pkg.identifier === packageId)
      if (!rcPackage)
        throw new Error(t('settings.pages.capacitor.checkout.error'))

      let customerInfo: CustomerInfo
      try {
        customerInfo = (await purchases.purchase({ rcPackage })).customerInfo
      }
      catch (error) {
        if (error instanceof PurchasesError && error.errorCode === ErrorCode.UserCancelledError)
          return 'cancelled'
        throw error
      }

      applyCustomerInfo(customerInfo)
      await options.onChanged().catch(() => undefined)
      return currentCapacitor.value ? 'activated' : 'pending'
    }
    finally {
      purchasingPackageId.value = null
    }
  }

  async function setFallbackToFlux(fallbackToFlux: boolean): Promise<void> {
    const res = await client.api.v1.flux.fallback.$put({ json: { fallbackToFlux } })
    if (!res.ok)
      throw new Error(t('settings.pages.capacitor.preferenceError'))
    await options.onChanged().catch(() => undefined)
  }

  return {
    managementUrl,
    currentCapacitor,
    packages,
    purchasingPackageId,
    fetchStatus,
    fetchPackages,
    purchaseCapacitor,
    setFallbackToFlux,
  }
}

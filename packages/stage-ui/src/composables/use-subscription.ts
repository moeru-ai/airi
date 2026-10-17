import type { CustomerInfo, Package, PurchaseParams, Store } from '@revenuecat/purchases-js'

import { getRevenuecatWebKey, isCapacitorAvailable } from '@proj-airi/stage-shared'
import { ErrorCode, Purchases, PurchasesError } from '@revenuecat/purchases-js'
import { object, optional, picklist, pipe, record, safeParse, string, trim } from 'valibot'
import { onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { client } from './api'

/**
 * The SDK identity that the shared Purchases instance has, or is switching to.
 * The page reads the customer and the offerings at the same time, so both calls share one `changeUser`.
 */
let identity: { key: string, userId: string, ready: Promise<Purchases> } | null = null

/**
 * Returns the shared Purchases instance for the current web key and user.
 * Re-keys the client when either changes so concurrent accounts never share identity.
 */
async function ensurePurchases(userId: string): Promise<Purchases> {
  const key = getRevenuecatWebKey()
  if (!key)
    throw new Error('REVENUECAT_WEB_KEY_MISSING')

  if (!Purchases.isConfigured()) {
    Purchases.configure({ apiKey: key, appUserId: userId })
    identity = { key, userId, ready: Promise.resolve(Purchases.getSharedInstance()) }
  }
  if (identity?.key === key && identity.userId === userId)
    return identity.ready

  const purchases = Purchases.getSharedInstance()
  const ready = purchases.changeUser(userId).then(() => purchases)
  const switching = { key, userId, ready }
  identity = switching
  // A failed switch must not stay cached. The next call tries again.
  ready.catch(() => {
    if (identity === switching)
      identity = null
  })
  return ready
}

/** The stores that the Web SDK can change a product for. App Store and Google Play subscriptions change only in their store. */
const WEB_STORES: ReadonlySet<Store> = new Set(['rc_billing', 'stripe'])

/**
 * The product change fields of `purchase()`, which the SDK marks internal while the feature is in beta.
 * See https://www.revenuecat.com/docs/web/product-changes
 */
interface ProductChangeParams extends PurchaseParams {
  productChangeInfo?: {
    subscriptionId: string
    subscriberToken: string
  }
}

/**
 * `deferred` is a downgrade that starts at the next renewal. `immediate` is an upgrade that starts now.
 * A purchase without a product change has no `productChange`.
 */
const productChangeResultSchema = object({
  productChange: optional(object({ changeType: picklist(['immediate', 'deferred']) })),
})

export interface CurrentCapacitor {
  entitlementId: string
  productId: string
  expiresAt: string | null
  willRenew: boolean
  /** True when the web app can change the product. Otherwise the store that bills it changes it. */
  changeableOnWeb: boolean
}

export interface CapacitorPackage {
  packageId: string
  productId: string
  name: string | null
  benefit: string | null
  formattedPrice: string
  amountMicros: number
  /** The Flux that the Capacitor holds after each refill. */
  quota: number
}

/** A Capacitor that replaces the current one at the next renewal, as the server reports after a sync. */
export interface PendingCapacitorChange {
  productId: string
  startsAt: string
}

/** How often a full Capacitor refills. Null means once at each renewal. */
export type CapacitorResetInterval = 'day' | 'week' | null

/** What a checkout did. `scheduled` is a downgrade that starts at the next renewal. */
export type CapacitorCheckoutOutcome = 'activated' | 'scheduled' | 'pending' | 'cancelled'

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
  latestPurchaseDate: Date
  expirationDate: Date | null
  willRenew: boolean
  store: Store
}

/**
 * Picks the active entitlement with the latest purchase.
 * The server grants the quota by the same rule, so the page and the wallet show one Capacitor.
 */
export function currentCapacitorFromCustomerInfo(info: {
  entitlements: { active: Record<string, CapacitorEntitlement> }
}): CurrentCapacitor | null {
  const active = Object.values(info.entitlements.active)
  const chosen = active.reduce<typeof active[number] | null>((best, item) => {
    if (!best)
      return item
    return item.latestPurchaseDate.getTime() > best.latestPurchaseDate.getTime() ? item : best
  }, null)
  if (!chosen)
    return null
  return {
    entitlementId: chosen.identifier,
    productId: chosen.productIdentifier,
    expiresAt: chosen.expirationDate?.toISOString() ?? null,
    willRenew: chosen.willRenew,
    changeableOnWeb: WEB_STORES.has(chosen.store),
  }
}

/** A period of two or more months has the unit `month` too. Its price is not a monthly price. */
export function isOneMonthPeriod(period: { number: number, unit: string } | null): boolean {
  return period?.unit === 'month' && period.number === 1
}

/**
 * Capacitors are sold by the month only. Packages with another billing period are not listed.
 * An unmapped product takes the payment and grants no Flux, so it is not listed.
 */
function toCapacitorPackage(pkg: Package, metadata: unknown, locale: string, quota: number | undefined): CapacitorPackage | null {
  if (!isOneMonthPeriod(pkg.webBillingProduct.period) || quota === undefined)
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
    quota,
  }
}

/**
 * Capacitor subscriptions through RevenueCat Web Billing. The SDK reports the capacitor.
 * The server grants capacitor Flux on a webhook, and on the sync that this composable requests.
 *
 * The page loads three independent reads at the same time:
 * - {@link refreshCustomer} reads the current Capacitor from the SDK.
 * - {@link refreshWallet} asks the server to sync, then reads the balance, which carries the Capacitor percent.
 * - {@link fetchPackages} reads the offerings and the Capacitors that the server grants.
 */
export function useSubscription(options: {
  getUserId: () => string
  onChanged: () => Promise<unknown>
}) {
  const { t, locale } = useI18n()
  const enabled = isCapacitorAvailable()

  const currentCapacitor = ref<CurrentCapacitor | null>(null)
  const packages = ref<CapacitorPackage[]>([])
  const resetInterval = ref<CapacitorResetInterval>(null)
  const pendingChange = ref<PendingCapacitorChange | null>(null)
  const purchasingPackageId = ref<string | null>(null)
  const managementUrl = ref<string | null>(null)

  let identityVersion = 0

  function clearState() {
    identityVersion += 1
    currentCapacitor.value = null
    managementUrl.value = null
    packages.value = []
    resetInterval.value = null
    pendingChange.value = null
    purchasingPackageId.value = null
  }

  watch(options.getUserId, clearState, { flush: 'sync' })
  onScopeDispose(clearState)

  function captureIdentity() {
    const userId = options.getUserId()
    const version = identityVersion
    return { userId, isCurrent: () => version === identityVersion && userId === options.getUserId() }
  }

  function applyCustomerInfo(info: CustomerInfo) {
    currentCapacitor.value = currentCapacitorFromCustomerInfo(info)
    managementUrl.value = info.managementURL
  }

  /** Reads the current Capacitor, its renewal, and the management link from the SDK. Errors reach the page. */
  async function refreshCustomer(): Promise<void> {
    const identity = captureIdentity()
    if (!enabled || !identity.userId)
      return
    const purchases = await ensurePurchases(identity.userId)
    if (!identity.isCurrent())
      return
    const info = await purchases.getCustomerInfo()
    if (identity.isCurrent())
      applyCustomerInfo(info)
  }

  /**
   * Asks the server to read the capacitor from RevenueCat now.
   * A webhook can be late or lost. This call grants the capacitor Flux without it.
   * A rejected sync is not an error here. The webhook stays the usual path, and the balance read still runs.
   * The response also names a scheduled downgrade, which the SDK does not report.
   */
  async function syncWallet(): Promise<void> {
    const identity = captureIdentity()
    const res = await client.api.v1.revenuecat.sync.$post()
    if (!res.ok)
      return
    const body = await res.json()
    if (identity.isCurrent())
      pendingChange.value = body.pendingChange
  }

  /** Syncs the wallet, then refreshes the balance, which carries the capacitor percent. */
  async function refreshWallet(): Promise<void> {
    const identity = captureIdentity()
    if (!identity.userId)
      return
    // The SDK reports the Capacitor by itself. A sync that cannot reach the server must not hide it,
    // so the balance read still runs.
    if (enabled)
      await syncWallet().catch(() => undefined)
    if (identity.isCurrent())
      await options.onChanged()
  }

  /** The Capacitors that the server grants, with the quota of each. Another product takes the payment and grants nothing. */
  async function fetchCatalog() {
    const res = await client.api.v1.revenuecat.catalog.$get()
    if (!res.ok)
      throw new Error(t('settings.pages.capacitor.packagesError'))
    const catalog = await res.json()
    return {
      quotas: new Map(catalog.capacitors.map(capacitor => [capacitor.productId, capacitor.quota])),
      resetInterval: catalog.resetInterval,
    }
  }

  async function fetchPackages(): Promise<void> {
    const identity = captureIdentity()
    packages.value = []
    if (!enabled || !identity.userId)
      return
    const [purchases, catalog] = await Promise.all([ensurePurchases(identity.userId), fetchCatalog()])
    if (!identity.isCurrent())
      return
    const current = (await purchases.getOfferings()).current
    if (!identity.isCurrent() || !current)
      return
    resetInterval.value = catalog.resetInterval
    packages.value = current.availablePackages
      .flatMap((pkg) => {
        const capacitorPackage = toCapacitorPackage(pkg, current.metadata, locale.value, catalog.quotas.get(pkg.webBillingProduct.identifier))
        return capacitorPackage ? [capacitorPackage] : []
      })
      .sort((left, right) => left.amountMicros - right.amountMicros)
  }

  /**
   * Asks the server for the token that lets the SDK replace the current web subscription.
   * Null means that no web subscription can change, so the store that bills it must change it.
   */
  async function fetchProductChange(): Promise<ProductChangeParams['productChangeInfo'] | null> {
    const res = await client.api.v1.revenuecat['product-change'].$post()
    if (res.status === 409)
      return null
    if (!res.ok)
      throw new Error(t('settings.pages.capacitor.checkout.error'))
    return await res.json()
  }

  /**
   * Buys a Capacitor, or changes the current one to it.
   * A subscriber gets an upgrade at once and a downgrade at the next renewal. RevenueCat decides which one by the price.
   */
  async function purchaseCapacitor(packageId: string): Promise<CapacitorCheckoutOutcome> {
    const identity = captureIdentity()
    if (!identity.userId)
      return 'cancelled'
    purchasingPackageId.value = packageId
    try {
      const changing = currentCapacitor.value !== null
      const [purchases, catalog, productChangeInfo] = await Promise.all([
        ensurePurchases(identity.userId),
        // The mapping can change after the page listed the packages, so the checkout reads it again.
        fetchCatalog(),
        changing ? fetchProductChange() : null,
      ])
      if (!identity.isCurrent())
        return 'cancelled'
      // A second purchase would charge for two Capacitors. The page sends a subscriber of another store
      // to that store, so this branch means that RevenueCat and the SDK disagree about the store.
      if (changing && !productChangeInfo)
        throw new Error(t('settings.pages.capacitor.checkout.error'))
      const offerings = await purchases.getOfferings()
      if (!identity.isCurrent())
        return 'cancelled'
      const rcPackage = offerings.current?.availablePackages.find(pkg => pkg.identifier === packageId)
      if (!rcPackage || !catalog.quotas.has(rcPackage.webBillingProduct.identifier))
        throw new Error(t('settings.pages.capacitor.checkout.error'))

      // NOTICE:
      // `productChangeInfo` makes the checkout replace the subscription instead of adding a second one.
      // The SDK marks the field internal while product changes are in beta, so its type omits it.
      // https://www.revenuecat.com/docs/web/product-changes
      // Remove this local type when `PurchaseParams` declares `productChangeInfo`.
      const params: ProductChangeParams = productChangeInfo ? { rcPackage, productChangeInfo } : { rcPackage }
      let result: Awaited<ReturnType<typeof purchases.purchase>>
      try {
        result = await purchases.purchase(params)
      }
      catch (error) {
        if (error instanceof PurchasesError && error.errorCode === ErrorCode.UserCancelledError)
          return 'cancelled'
        throw error
      }

      if (!identity.isCurrent())
        return 'cancelled'
      applyCustomerInfo(result.customerInfo)
      // The purchase is complete. A failed sync leaves the grant to the webhook,
      // and the page then reports the charge as pending.
      await syncWallet().catch(() => undefined)
      await options.onChanged().catch(() => undefined)
      if (!identity.isCurrent())
        return 'cancelled'
      const change = safeParse(productChangeResultSchema, result)
      if (change.success && change.output.productChange?.changeType === 'deferred')
        return 'scheduled'
      return currentCapacitor.value ? 'activated' : 'pending'
    }
    finally {
      if (identity.isCurrent())
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
    resetInterval,
    pendingChange,
    purchasingPackageId,
    refreshCustomer,
    refreshWallet,
    fetchPackages,
    purchaseCapacitor,
    setFallbackToFlux,
  }
}

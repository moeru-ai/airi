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

type SubscriptionStatus = Awaited<ReturnType<Awaited<ReturnType<typeof client.api.v1.subscriptions.status.$get>>['json']>>

export interface CurrentPlan {
  entitlementId: string
  productId: string
  expiresAt: string | null
  willRenew: boolean
}

export type PlanBillingPeriod = 'month' | 'year'

export interface PlanPackage {
  packageId: string
  productId: string
  name: string | null
  benefit: string | null
  formattedPrice: string
  currency: string
  period: PlanBillingPeriod
  amountMicros: number
}

export interface PlanCatalogCopy {
  name: string | null
  benefit: string | null
}

const planListingSchema = object({
  name: optional(pipe(string(), trim())),
  benefit: optional(pipe(string(), trim())),
})

const planMetadataSchema = object({
  plans: optional(record(string(), record(string(), planListingSchema))),
})

const emptyPlanCatalogCopy: PlanCatalogCopy = { name: null, benefit: null }

/** Reads one product's name and benefit from offering metadata with English fallback. */
export function planCatalogCopy(metadata: unknown, productId: string, locale: string): PlanCatalogCopy {
  const parsed = safeParse(planMetadataSchema, metadata ?? {})
  if (!parsed.success || !parsed.output.plans)
    return emptyPlanCatalogCopy
  const listing = parsed.output.plans[locale]?.[productId] ?? parsed.output.plans.en?.[productId]
  if (!listing)
    return emptyPlanCatalogCopy
  return {
    name: listing.name || null,
    benefit: listing.benefit || null,
  }
}

interface PlanEntitlement {
  identifier: string
  productIdentifier: string
  expirationDate: Date | null
  willRenew: boolean
}

/**
 * Picks the active entitlement that lasts longest.
 * A lifetime entitlement has no expiry and outranks a dated one.
 */
export function currentPlanFromCustomerInfo(info: {
  entitlements: { active: Record<string, PlanEntitlement> }
}): CurrentPlan | null {
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

/** Only month and year packages are sold. */
function planBillingPeriod(unit: string | null | undefined): PlanBillingPeriod | null {
  if (unit === 'month' || unit === 'year')
    return unit
  return null
}

function toPlanPackage(pkg: Package, metadata: unknown, locale: string): PlanPackage | null {
  const period = planBillingPeriod(pkg.webBillingProduct.period?.unit)
  if (!period)
    return null
  const price = pkg.webBillingProduct.price
  const copy = planCatalogCopy(metadata, pkg.webBillingProduct.identifier, locale)
  return {
    packageId: pkg.identifier,
    productId: pkg.webBillingProduct.identifier,
    name: copy.name,
    benefit: copy.benefit,
    formattedPrice: price.formattedPrice,
    currency: price.currency,
    period,
    amountMicros: price.amountMicros,
  }
}

/** Plan subscriptions through RevenueCat Web Billing. The SDK reports the plan. The webhook grants Credits. */
export function useSubscription(options: {
  getUserId: () => string
  onChanged: () => Promise<unknown>
}) {
  const { t, locale } = useI18n()
  const enabled = !isFluxPurchaseDisabled() && getRevenuecatWebKey() != null

  const status = ref<SubscriptionStatus | null>(null)
  const currentPlan = ref<CurrentPlan | null>(null)
  const packages = ref<PlanPackage[]>([])
  const loadingPackages = ref(false)
  const purchasingPackageId = ref<string | null>(null)
  const managementUrl = ref<string | null>(null)

  function applyCustomerInfo(info: CustomerInfo) {
    currentPlan.value = currentPlanFromCustomerInfo(info)
    managementUrl.value = info.managementURL
  }

  async function refreshCustomer(): Promise<void> {
    if (!enabled)
      return
    const purchases = await ensurePurchases(options.getUserId())
    applyCustomerInfo(await purchases.getCustomerInfo())
  }

  async function fetchServerStatus(): Promise<void> {
    const res = await client.api.v1.subscriptions.status.$get()
    if (!res.ok)
      throw new Error(t('settings.pages.plan.statusError'))
    status.value = await res.json()
  }

  async function fetchStatus(): Promise<void> {
    await fetchServerStatus()
    await refreshCustomer().catch(() => undefined)
    await options.onChanged().catch(() => undefined)
  }

  async function fetchPackages(): Promise<void> {
    packages.value = []
    if (!enabled)
      return
    loadingPackages.value = true
    try {
      const purchases = await ensurePurchases(options.getUserId())
      const offerings = await purchases.getOfferings()
      const current = offerings.current
      if (!current)
        return
      packages.value = current.availablePackages.flatMap((pkg) => {
        const planPackage = toPlanPackage(pkg, current.metadata, locale.value)
        return planPackage ? [planPackage] : []
      })
    }
    finally {
      loadingPackages.value = false
    }
  }

  async function purchasePlan(packageId: string): Promise<'activated' | 'pending' | 'cancelled'> {
    purchasingPackageId.value = packageId
    try {
      const purchases = await ensurePurchases(options.getUserId())
      const offerings = await purchases.getOfferings()
      const rcPackage = offerings.current?.availablePackages.find(pkg => pkg.identifier === packageId)
      if (!rcPackage)
        throw new Error(t('settings.pages.plan.checkout.error'))

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
      await fetchServerStatus().catch(() => undefined)
      await options.onChanged().catch(() => undefined)
      return currentPlan.value ? 'activated' : 'pending'
    }
    finally {
      purchasingPackageId.value = null
    }
  }

  async function setFallbackToFlux(fallbackToFlux: boolean): Promise<void> {
    const res = await client.api.v1.subscriptions.preference.$put({ json: { fallbackToFlux } })
    if (!res.ok)
      throw new Error(t('settings.pages.plan.preferenceError'))
    const data = await res.json()
    if (status.value)
      status.value = { ...status.value, fallbackToFlux: data.fallbackToFlux }
  }

  return {
    managementUrl,
    status,
    currentPlan,
    packages,
    loadingPackages,
    purchasingPackageId,
    fetchStatus,
    fetchPackages,
    purchasePlan,
    setFallbackToFlux,
  }
}

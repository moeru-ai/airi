import type { Package } from '@revenuecat/purchases-js'

import { getRevenuecatWebKey, isFluxPurchaseDisabled } from '@proj-airi/stage-shared'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { client } from './api'
import { ensureRevenuecatConfigured, isRevenuecatUserCancelled, REVENUECAT_POLL_INTERVAL_MS, REVENUECAT_POLL_MAX_ATTEMPTS, revenuecatPackagePrice } from './revenuecat'

export interface PlanSubscription {
  entitlementId: string
  productId: string | null
  store: string | null
  environment: string | null
  status: string
  expiresAt: string | null
}

export interface PlanAllowance {
  entitlementId: string
  periodStart: string
  periodEnd: string | null
  grantedAmount: number
  usedAmount: number
  remainingAmount: number
}

export type PlanBillingPeriod = 'month' | 'year'

export interface PlanPackage {
  packageId: string
  productId: string
  title: string
  formattedPrice: string
  currency: string
  period: PlanBillingPeriod
  amountMicros: number
}

/** Keeps RevenueCat's period unit. A month stays a month. A year stays a year. */
export function planBillingPeriod(unit: string | null | undefined): PlanBillingPeriod | null {
  if (unit === 'month' || unit === 'year')
    return unit
  return null
}

interface PlanStatus {
  subscriptions: PlanSubscription[]
  allowances: PlanAllowance[]
  fallbackToFlux: boolean
}

function toPlanPackage(pkg: Package): PlanPackage | null {
  const period = planBillingPeriod(pkg.webBillingProduct.period?.unit)
  if (!period)
    return null
  const { formattedPrice, currency } = revenuecatPackagePrice(pkg)
  return {
    packageId: pkg.identifier,
    productId: pkg.webBillingProduct.identifier,
    title: pkg.webBillingProduct.title,
    formattedPrice,
    currency,
    period,
    amountMicros: pkg.webBillingProduct.price.amountMicros,
  }
}

/**
 * Plan subscriptions (Go / Plus) through RevenueCat Web Billing.
 * Status and quota usage are read from the backend subscription table;
 * the grant lands through the RevenueCat webhook, so the caller polls
 * status until the new subscription appears.
 */
export function useSubscription(options: {
  getUserId: () => string
  onChanged: () => Promise<unknown>
}) {
  const { t } = useI18n()
  const enabled = !isFluxPurchaseDisabled() && getRevenuecatWebKey() != null

  const status = ref<PlanStatus | null>(null)
  const packages = ref<PlanPackage[]>([])
  const loadingPackages = ref(false)
  const purchasingPackageId = ref<string | null>(null)
  const pendingActivation = ref(false)
  const missingKey = computed(() => getRevenuecatWebKey() == null)
  const managementUrl = ref<string | null>(null)

  async function fetchManagementUrl(): Promise<void> {
    if (!enabled)
      return
    try {
      const purchases = await ensureRevenuecatConfigured(options.getUserId())
      managementUrl.value = (await purchases.getCustomerInfo()).managementURL
    }
    catch {
      managementUrl.value = null
    }
  }

  async function fetchStatus(): Promise<void> {
    const res = await client.api.v1.subscriptions.status.$get()
    if (!res.ok)
      throw new Error(t('settings.pages.plan.statusError'))
    status.value = await res.json() as PlanStatus
    await options.onChanged().catch(() => undefined)
  }

  async function fetchPackages(): Promise<void> {
    packages.value = []
    if (!enabled)
      return
    loadingPackages.value = true
    try {
      const purchases = await ensureRevenuecatConfigured(options.getUserId())
      const offerings = await purchases.getOfferings()
      const current = offerings.current
      if (!current)
        return
      packages.value = current.availablePackages.flatMap((pkg) => {
        const planPackage = toPlanPackage(pkg)
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
      const purchases = await ensureRevenuecatConfigured(options.getUserId())
      const offerings = await purchases.getOfferings()
      const rcPackage = offerings.current?.availablePackages.find(pkg => pkg.identifier === packageId)
      if (!rcPackage)
        throw new Error(t('settings.pages.plan.checkout.error'))

      try {
        await purchases.purchase({ rcPackage })
      }
      catch (error) {
        if (await isRevenuecatUserCancelled(error))
          return 'cancelled'
        throw error
      }

      const activated = await pollActivation()
      return activated ? 'activated' : 'pending'
    }
    finally {
      purchasingPackageId.value = null
    }
  }

  async function pollActivation(): Promise<boolean> {
    pendingActivation.value = true
    try {
      for (let attempt = 0; attempt < REVENUECAT_POLL_MAX_ATTEMPTS; attempt++) {
        await new Promise(resolve => setTimeout(resolve, REVENUECAT_POLL_INTERVAL_MS))
        try {
          const res = await client.api.v1.subscriptions.status.$get()
          if (res.ok) {
            status.value = await res.json() as PlanStatus
            if (status.value.subscriptions.length > 0)
              return true
          }
        }
        catch {
          // Keep polling through transient failures.
        }
      }
      return false
    }
    finally {
      pendingActivation.value = false
    }
  }

  async function setFallbackToFlux(fallbackToFlux: boolean): Promise<void> {
    const res = await client.api.v1.subscriptions.preference.$put({ json: { fallbackToFlux } })
    if (!res.ok)
      throw new Error(t('settings.pages.plan.preferenceError'))
    const data = await res.json() as { fallbackToFlux: boolean }
    if (status.value)
      status.value = { ...status.value, fallbackToFlux: data.fallbackToFlux }
  }

  return {
    enabled,
    missingKey,
    managementUrl,
    status,
    packages,
    loadingPackages,
    purchasingPackageId,
    pendingActivation,
    fetchStatus,
    fetchManagementUrl,
    fetchPackages,
    purchasePlan,
    setFallbackToFlux,
  }
}

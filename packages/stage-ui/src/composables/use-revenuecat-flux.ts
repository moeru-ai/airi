import type { Package } from '@revenuecat/purchases-js'

import { getRevenuecatFluxOfferingId, getRevenuecatWebKey, isFluxPurchaseDisabled } from '@proj-airi/stage-shared'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { client } from './api'
import { ensureRevenuecatConfigured, isRevenuecatUserCancelled, REVENUECAT_POLL_INTERVAL_MS, REVENUECAT_POLL_MAX_ATTEMPTS, revenuecatPackagePrice } from './revenuecat'

export interface RevenuecatFluxPackage {
  packageId: string
  productId: string
  title: string
  fluxAmount: number
  formattedPrice: string
  currency: string
}

interface BackendFluxPack {
  productId: string
  fluxAmount: number
}

function toFluxPackage(pkg: Package, fluxAmount: number): RevenuecatFluxPackage {
  const { formattedPrice, currency } = revenuecatPackagePrice(pkg)
  return {
    packageId: pkg.identifier,
    productId: pkg.webBillingProduct.identifier,
    title: pkg.webBillingProduct.title,
    fluxAmount,
    formattedPrice,
    currency,
  }
}

/**
 * RevenueCat Web Billing checkout for Flux packs.
 * Package prices come from the `flux_packs` offering; Flux amounts come
 * from the backend `/revenuecat/packages` map so the grant source of truth
 * stays server-side. After a successful purchase the Flux credit lands via
 * webhook, so the caller polls its balance until it moves.
 */
export function useRevenuecatFlux(options: {
  getUserId: () => string
  onPaid: () => Promise<unknown>
  getBalance: () => number
}) {
  const { t } = useI18n()
  const enabled = !isFluxPurchaseDisabled() && getRevenuecatWebKey() != null

  const packages = ref<RevenuecatFluxPackage[]>([])
  const loadingPackages = ref(false)
  const purchasingPackageId = ref<string | null>(null)
  const pendingCredit = ref(false)

  const missingKey = computed(() => getRevenuecatWebKey() == null)

  async function fetchPackages(currency?: string): Promise<void> {
    packages.value = []
    if (!enabled)
      return
    loadingPackages.value = true
    try {
      const res = await client.api.v1.revenuecat.packages.$get()
      if (!res.ok)
        throw new Error(t('settings.pages.flux.packagesError'))
      const packs = await res.json() as BackendFluxPack[]
      const fluxByProduct = new Map(packs.map(pack => [pack.productId, pack.fluxAmount]))

      const purchases = await ensureRevenuecatConfigured(options.getUserId())
      const offerings = await purchases.getOfferings(currency ? { currency } : undefined)
      const offering = offerings.all[getRevenuecatFluxOfferingId()] ?? offerings.current
      if (!offering)
        return

      packages.value = offering.availablePackages.flatMap((pkg) => {
        const fluxAmount = fluxByProduct.get(pkg.webBillingProduct.identifier)
        return fluxAmount == null ? [] : [toFluxPackage(pkg, fluxAmount)]
      })
    }
    finally {
      loadingPackages.value = false
    }
  }

  async function purchaseFluxPackage(packageId: string): Promise<'credited' | 'pending' | 'cancelled'> {
    const target = packages.value.find(pkg => pkg.packageId === packageId)
    if (!target)
      throw new Error(t('settings.pages.flux.checkout.error'))

    purchasingPackageId.value = packageId
    try {
      const purchases = await ensureRevenuecatConfigured(options.getUserId())
      const offerings = await purchases.getOfferings()
      const offering = offerings.all[getRevenuecatFluxOfferingId()] ?? offerings.current
      const rcPackage = offering?.availablePackages.find(pkg => pkg.identifier === packageId)
      if (!rcPackage)
        throw new Error(t('settings.pages.flux.checkout.error'))

      try {
        await purchases.purchase({ rcPackage })
      }
      catch (error) {
        if (await isRevenuecatUserCancelled(error))
          return 'cancelled'
        throw error
      }

      const credited = await pollCredit(options.getBalance)
      return credited ? 'credited' : 'pending'
    }
    finally {
      purchasingPackageId.value = null
    }
  }

  async function pollCredit(getBalance: () => number): Promise<boolean> {
    const before = getBalance()
    pendingCredit.value = true
    try {
      for (let attempt = 0; attempt < REVENUECAT_POLL_MAX_ATTEMPTS; attempt++) {
        await new Promise(resolve => setTimeout(resolve, REVENUECAT_POLL_INTERVAL_MS))
        await options.onPaid().catch(() => undefined)
        if (getBalance() > before)
          return true
      }
      return false
    }
    finally {
      pendingCredit.value = false
    }
  }

  return {
    enabled,
    missingKey,
    packages,
    loadingPackages,
    purchasingPackageId,
    pendingCredit,
    fetchPackages,
    purchaseFluxPackage,
  }
}

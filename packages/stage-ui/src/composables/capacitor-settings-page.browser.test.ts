import type { CustomerInfo, EntitlementInfo } from '@revenuecat/purchases-js'

import en from '@proj-airi/i18n/locales/en'

import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import CapacitorPage from '../../../stage-pages/src/pages/settings/capacitor.vue'

import 'virtual:uno.css'

const sdk = vi.hoisted(() => ({
  getCustomerInfo: vi.fn<() => Promise<CustomerInfo>>(),
  changeUser: vi.fn(async () => {}),
  getOfferings: vi.fn(),
  purchase: vi.fn(),
}))

vi.mock('@revenuecat/purchases-js', async (importOriginal) => {
  const original = await importOriginal<typeof import('@revenuecat/purchases-js')>()
  return {
    ...original,
    Purchases: {
      isConfigured: () => true,
      getSharedInstance: () => sdk,
    },
  }
})

function customer(productId: string | null, store: EntitlementInfo['store'] = 'rc_billing'): CustomerInfo {
  const entitlement: EntitlementInfo = {
    identifier: 'capacitor',
    isActive: true,
    willRenew: true,
    store,
    latestPurchaseDate: new Date(),
    originalPurchaseDate: new Date(),
    expirationDate: new Date('2030-01-01'),
    productIdentifier: productId ?? 'monthly',
    productPlanIdentifier: null,
    unsubscribeDetectedAt: null,
    billingIssueDetectedAt: null,
    isSandbox: true,
    periodType: 'normal',
    ownershipType: 'PURCHASED',
  }
  const entitlements: CustomerInfo['entitlements']['active'] = productId ? { capacitor: entitlement } : {}
  return {
    entitlements: { active: entitlements, all: entitlements },
    allExpirationDatesByProduct: {},
    allPurchaseDatesByProduct: {},
    activeSubscriptions: new Set(productId ? [productId] : []),
    managementURL: productId ? 'https://example.com/manage' : null,
    requestDate: new Date(),
    firstSeenDate: new Date(),
    originalPurchaseDate: null,
    originalAppUserId: 'owner',
    nonSubscriptionTransactions: [],
    subscriptionsByProductIdentifier: {},
  }
}

function monthlyPackage(productId: string, amountMicros: number) {
  return {
    identifier: `$rc_${productId}`,
    webBillingProduct: {
      identifier: productId,
      period: { number: 1, unit: 'month' },
      price: { formattedPrice: `$${amountMicros / 1_000_000}.00`, amountMicros },
    },
  }
}

describe('capacitor quota display and purchase actions', () => {
  let pinia: ReturnType<typeof createPinia>
  let requests: string[]

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.stubEnv('VITE_REVENUECAT_WEB_KEY', 'public-test-key')
    vi.stubEnv('VITE_DISABLE_FLUX_PURCHASE', 'false')
    sdk.getCustomerInfo.mockResolvedValue(customer('monthly'))
    sdk.getOfferings.mockResolvedValue({
      current: {
        metadata: { capacitors: { en: { monthly: { name: 'Go' }, plus: { name: 'Plus' } } } },
        availablePackages: [monthlyPackage('monthly', 5_000_000), monthlyPackage('plus', 10_000_000)],
      },
    })
    requests = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const { pathname } = new URL(input instanceof Request ? input.url : input)
      requests.push(pathname)
      if (pathname.endsWith('/capacitors'))
        return Response.json({ capacitors: [{ productId: 'monthly', quota: 100 }, { productId: 'plus', quota: 300 }], resetInterval: 'day' })
      if (pathname.endsWith('/sync'))
        return Response.json({ synced: true, pendingChange: null })
      if (pathname.endsWith('/product-change'))
        return Response.json({ subscriptionId: 'subscription-owner', subscriberToken: 'subscriber-token' })
      return Response.json({ flux: 150, capacitorPercent: 50, capacitorRechargesAt: null, fallbackToFlux: false })
    })
  })

  afterEach(() => {
    cleanup()
    disposePinia(pinia)
    localStorage.clear()
    vi.restoreAllMocks()
    vi.clearAllMocks()
    vi.unstubAllEnvs()
  })

  function openPage() {
    const store = useAuthStore()
    const now = new Date()
    store.$patch({
      user: { id: 'owner', name: 'Owner', email: 'owner@example.com', emailVerified: true, createdAt: now, updatedAt: now },
      session: { id: 'session-owner', userId: 'owner', token: 'owner-token', createdAt: now, updatedAt: now, expiresAt: new Date(Date.now() + 60_000) },
      token: 'owner-token',
    })
    return render(CapacitorPage, {
      global: { plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: false, fallbackWarn: false })] },
    })
  }

  it.each([
    { productId: 'monthly', action: 'Upgrade' },
    { productId: 'plus', action: 'Downgrade' },
  ])('keeps $action in the store subscription management page', async ({ productId, action }) => {
    sdk.getCustomerInfo.mockResolvedValue(customer(productId, 'app_store'))
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const screen = openPage()

    await expect.element(screen.getByText('100 Flux every day')).toBeVisible()
    await expect.element(screen.getByText('300 Flux every day')).toBeVisible()
    await screen.getByRole('button', { name: action, exact: true }).click()

    expect(open).toHaveBeenCalledWith('https://example.com/manage', '_blank', 'noopener')
    expect(sdk.purchase).not.toHaveBeenCalled()
  })

  it('keeps the ordinary checkout for the first purchase and shows its result without a default heading', async () => {
    sdk.getCustomerInfo.mockResolvedValue(customer(null))
    sdk.getOfferings.mockResolvedValue({
      current: { metadata: null, availablePackages: [monthlyPackage('monthly', 5_000_000)] },
    })
    sdk.purchase.mockResolvedValue({ customerInfo: customer('monthly') })
    const screen = openPage()

    await screen.getByRole('button', { name: 'Install', exact: true }).click()

    await vi.waitFor(() => expect(sdk.purchase).toHaveBeenCalledWith({ rcPackage: expect.objectContaining({ identifier: '$rc_monthly' }) }))
    expect(requests).not.toContain('/api/v1/revenuecat/product-change')
    await expect.element(screen.getByRole('status')).toHaveTextContent('Your Capacitor is installed and charged.')
    expect(screen.getByText('Callout', { exact: true }).elements()).toHaveLength(0)
  })

  // https://github.com/moeru-ai/airi/pull/3003
  // ROOT CAUSE:
  // Parallel package reads exposed checkout before the customer read completed.
  // Unknown customer state selected an ordinary purchase without productChangeInfo.
  // The page now requires a successful customer read before it enables checkout.
  it('disables checkout while the customer read is pending (Issue #3003)', async () => {
    let resolveCustomer: (info: CustomerInfo) => void = () => {
      throw new Error('Expected a pending customer read')
    }
    sdk.getCustomerInfo.mockReturnValueOnce(new Promise(resolve => resolveCustomer = resolve))
    sdk.getOfferings.mockResolvedValue({
      current: { metadata: null, availablePackages: [monthlyPackage('plus', 10_000_000)] },
    })
    const screen = openPage()

    await expect.element(screen.getByRole('button', { name: 'Install', exact: true })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Install', exact: true })).toBeDisabled()
    expect(sdk.purchase).not.toHaveBeenCalled()
    resolveCustomer(customer('monthly'))
    await expect.element(screen.getByRole('button', { name: 'Upgrade', exact: true })).toBeEnabled()
  })

  // https://github.com/moeru-ai/airi/pull/3003
  // ROOT CAUSE:
  // A failed customer read left the subscription unknown while package actions stayed active.
  // The page now keeps checkout disabled and shows the customer error.
  it('keeps checkout disabled when the customer read fails (Issue #3003)', async () => {
    sdk.getCustomerInfo.mockRejectedValueOnce(new Error('SDK unavailable'))
    sdk.getOfferings.mockResolvedValue({
      current: { metadata: null, availablePackages: [monthlyPackage('plus', 10_000_000)] },
    })
    const screen = openPage()

    await expect.element(screen.getByRole('status')).toHaveTextContent('Failed to load your Capacitor.')
    await expect.element(screen.getByRole('button', { name: 'Install', exact: true })).toBeDisabled()
    expect(sdk.purchase).not.toHaveBeenCalled()
    expect(requests).not.toContain('/api/v1/revenuecat/product-change')
  })
})

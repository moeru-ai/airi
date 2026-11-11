import type { CustomerInfo, EntitlementInfo } from '@revenuecat/purchases-js'

import en from '@proj-airi/i18n/locales/en'

import { configureAnalyticsAdapter } from '@proj-airi/stage-ui/libs/product-signals'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import CapacitorSection from '../../../stage-pages/src/components/capacitor-section.vue'

import 'virtual:uno.css'

const sdk = vi.hoisted(() => ({
  getCustomerInfo: vi.fn<() => Promise<CustomerInfo>>(),
  changeUser: vi.fn(),
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

const capture = vi.fn((_name: string, _properties: object) => true)
beforeAll(() => {
  configureAnalyticsAdapter(async () => ({
    capture,
    getIdentitySnapshot: () => null,
    identify: () => {},
    registerBuildInfo: () => {},
    resetIdentity: () => {},
    setCaptureEnabled: () => true,
  }))
})

/** The subscription funnel events, in order, with their plan and surface. */
function funnel() {
  return capture.mock.calls
    .filter(([name]) => ['pricing_page_viewed', 'plan_selected', 'checkout_started'].includes(name))
    .map(([name, properties]) => ({ name, ...properties as Record<string, unknown> }))
}

function customer(productId: string | null): CustomerInfo {
  const entitlement: EntitlementInfo = {
    identifier: 'capacitor',
    isActive: true,
    willRenew: true,
    store: 'rc_billing',
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
  let wallet: { capacitorPercent: number | null, fallbackToFlux: boolean }

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.stubEnv('VITE_REVENUECAT_WEB_KEY', 'public-test-key')
    vi.stubEnv('VITE_DISABLE_FLUX_PURCHASE', 'false')
    vi.stubEnv('VITE_ENABLE_ANALYTICS', 'true')
    capture.mockClear()
    sdk.getCustomerInfo.mockResolvedValue(customer('monthly'))
    sdk.getOfferings.mockResolvedValue({
      current: {
        metadata: { capacitors: { en: { monthly: { name: 'Go' }, plus: { name: 'Plus' } } } },
        availablePackages: [monthlyPackage('monthly', 5_000_000), monthlyPackage('plus', 10_000_000)],
      },
    })
    requests = []
    wallet = { capacitorPercent: 50, fallbackToFlux: false }
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const { pathname } = new URL(input instanceof Request ? input.url : input)
      requests.push(pathname)
      if (pathname.endsWith('/catalog'))
        return Response.json({ capacitors: [{ productId: 'monthly', quota: 100 }, { productId: 'plus', quota: 300 }], resetInterval: 'day' })
      if (pathname.endsWith('/sync'))
        return Response.json({ synced: true })
      return Response.json({ flux: 150, capacitorRechargesAt: null, ...wallet })
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

  async function openPage() {
    const store = useAuthStore()
    const now = new Date()
    store.$patch({
      user: { id: 'owner', name: 'Owner', email: 'owner@example.com', emailVerified: true, createdAt: now, updatedAt: now },
      session: { id: 'session-owner', userId: 'owner', token: 'owner-token', createdAt: now, updatedAt: now, expiresAt: new Date(Date.now() + 60_000) },
      token: 'owner-token',
    })
    // The section renders inside the Flux page, which runs under a router.
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
    await router.push('/settings/flux')
    return render(CapacitorSection, {
      global: { plugins: [pinia, router, createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: false, fallbackWarn: false })] },
    })
  }

  it.each([
    { productId: 'monthly', action: 'Upgrade' },
    { productId: 'plus', action: 'Downgrade' },
  ])('keeps $action in the subscription management page', async ({ productId, action }) => {
    sdk.getCustomerInfo.mockResolvedValue(customer(productId))
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const screen = await openPage()

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
    const screen = await openPage()

    await screen.getByRole('button', { name: 'Subscribe', exact: true }).click()

    await vi.waitFor(() => expect(sdk.purchase).toHaveBeenCalledWith({ rcPackage: expect.objectContaining({ identifier: '$rc_monthly' }) }))
    expect(requests).not.toContain('/api/v1/revenuecat/product-change')
    await expect.element(screen.getByRole('status')).toHaveTextContent('You are subscribed. Your Capacitor is full.')
    expect(screen.getByText('Callout', { exact: true }).elements()).toHaveLength(0)
    expect(funnel()).toEqual([
      expect.objectContaining({ name: 'pricing_page_viewed', entry_surface: 'settings_flux', plan_period: 'monthly' }),
      expect.objectContaining({ name: 'plan_selected', entry_surface: 'settings_flux', plan_id: 'monthly' }),
      expect.objectContaining({ name: 'checkout_started', entry_surface: 'settings_flux', plan_id: 'monthly' }),
    ])
  })

  it('explains the Capacitor to a user without a subscription', async () => {
    sdk.getCustomerInfo.mockResolvedValue(customer(null))
    wallet = { capacitorPercent: null, fallbackToFlux: false }
    const screen = await openPage()

    await expect.element(screen.getByText('What is a Capacitor?')).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Subscribe', exact: true }).first()).toBeVisible()
  })

  it.each([
    { fallbackToFlux: false, warnings: 1 },
    { fallbackToFlux: true, warnings: 0 },
  ])('warns about an empty Capacitor only when Flux cannot pay (fallback $fallbackToFlux)', async ({ fallbackToFlux, warnings }) => {
    wallet = { capacitorPercent: 0, fallbackToFlux }
    const screen = await openPage()

    await expect.element(screen.getByText('Use your Flux balance when the Capacitor is empty')).toBeVisible()
    expect(screen.getByText('What is a Capacitor?').elements()).toHaveLength(0)
    expect(screen.getByText(/Your Capacitor is empty/).elements()).toHaveLength(warnings)
  })

  it('opens the browser checkout for this user when the build has a purchase link instead of the web SDK', async () => {
    vi.stubEnv('VITE_REVENUECAT_WEB_KEY', '')
    vi.stubEnv('VITE_REVENUECAT_PURCHASE_LINK', 'https://pay.example.com/link/')
    wallet = { capacitorPercent: null, fallbackToFlux: false }
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const screen = await openPage()

    await screen.getByRole('button', { name: 'Subscribe in browser', exact: true }).click()

    expect(open).toHaveBeenCalledWith('https://pay.example.com/link/owner', '_blank', 'noopener')
    expect(sdk.getCustomerInfo).not.toHaveBeenCalled()
    // The browser checkout lists every plan, so the funnel records the Capacitor, not one plan.
    expect(funnel().at(-1)).toEqual(expect.objectContaining({ name: 'checkout_started', plan_id: 'capacitor' }))
    await expect.element(screen.getByText('Waiting for the payment in your browser.')).toBeVisible()

    // The wallet reports the Capacitor after the payment, and focus on the window reads it again.
    wallet = { capacitorPercent: 100, fallbackToFlux: false }
    window.dispatchEvent(new Event('focus'))
    await expect.element(screen.getByRole('status')).toHaveTextContent('You are subscribed. Your Capacitor is full.')
    expect(requests).toContain('/api/v1/revenuecat/sync')
  })

  it('waits for the customer before it exposes package actions', async () => {
    let resolveCustomer: (info: CustomerInfo) => void = () => {
      throw new Error('Expected a pending customer read')
    }
    sdk.getCustomerInfo.mockReturnValueOnce(new Promise(resolve => resolveCustomer = resolve))
    const screen = await openPage()

    await vi.waitFor(() => expect(sdk.getCustomerInfo).toHaveBeenCalledOnce())
    expect(sdk.getOfferings).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Subscribe', exact: true }).elements()).toHaveLength(0)
    resolveCustomer(customer('monthly'))
    await expect.element(screen.getByRole('button', { name: 'Upgrade', exact: true })).toBeVisible()
  })
})

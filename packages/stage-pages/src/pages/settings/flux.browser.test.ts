import en from '@proj-airi/i18n/locales/en'

import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import FluxPage from './flux.vue'

import 'virtual:uno.css'

vi.mock(import('@proj-airi/stage-ui/composables/use-subscription'), async (importOriginal) => {
  const { useSubscription } = await importOriginal()
  return {
    useSubscription: options => ({
      ...useSubscription(options),
      fetchStatus: async () => { await options.onChanged() },
      fetchPackages: vi.fn().mockResolvedValue(undefined),
    }),
  }
})

describe('public Flux page', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (!url.endsWith('/api/v1/stripe/packages'))
        throw new Error(`Unexpected request: ${url}`)

      return Response.json([
        {
          stripePriceId: 'price_flux_500',
          label: '500 Flux',
          defaultCurrency: 'usd',
          currencies: { usd: '$3.00', cny: '¥20.00' },
        },
        {
          stripePriceId: 'price_flux_2000',
          label: '2000 Flux',
          defaultCurrency: 'usd',
          currencies: { usd: '$12.00', cny: '¥80.00' },
          recommended: true,
        },
      ])
    })
  })

  afterEach(() => {
    cleanup()
    disposePinia(pinia)
    vi.unstubAllGlobals()
  })

  it('keeps the original package cards public and sends purchase clicks to sign-in', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { template: '<div />' } }],
    })
    await router.push('/')

    const requestLogin = vi.spyOn(useAuthStore(pinia), 'requestLogin').mockResolvedValue()
    const screen = await render(FluxPage, {
      global: {
        plugins: [pinia, router, createI18n({ legacy: false, locale: 'en', messages: { en } })],
      },
    })

    await expect.element(screen.getByRole('button', { name: '500 Flux $3.00' })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'HOT 2000 Flux $12.00' })).toBeVisible()
    expect(screen.getByText('Current Flux').elements()).toHaveLength(0)
    expect(screen.getByText('Transaction History').elements()).toHaveLength(0)
    // The subscription and the balance belong to an account, so a signed-out visitor sees only the packs.
    expect(screen.getByTestId('flux-subscription').elements()).toHaveLength(0)
    expect(screen.getByTestId('flux-balance').elements()).toHaveLength(0)

    await screen.getByRole('button', { name: '500 Flux $3.00' }).click()

    expect(requestLogin).toHaveBeenCalledOnce()
  })
})

describe('flux page with the Capacitor subscription', () => {
  let pinia: ReturnType<typeof createPinia>
  let wallet: { capacitorPercent: number | null, fallbackToFlux?: boolean }
  let usage: { startedAt: string | null, endsAt: string | null, records: { at: string, percent: number }[] } | null

  beforeEach(() => {
    pinia = createPinia()
    vi.stubEnv('VITE_REVENUECAT_WEB_KEY', 'public-test-key')
    vi.stubEnv('VITE_DISABLE_FLUX_PURCHASE', 'false')
    wallet = { capacitorPercent: null }
    usage = { startedAt: null, endsAt: null, records: [] }
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const { pathname } = new URL(input instanceof Request ? input.url : input.toString())
      if (pathname.endsWith('/stripe/packages'))
        return Response.json([{ stripePriceId: 'price_flux_500', label: '500 Flux', defaultCurrency: 'usd', currencies: { usd: '$3.00' } }])
      if (pathname.endsWith('/flux/history'))
        return Response.json({ records: [], hasMore: false })
      if (pathname.endsWith('/flux/stats'))
        return Response.json({ capacity: 0 })
      if (pathname.endsWith('/flux/capacitor/usage'))
        return usage ? Response.json(usage) : new Response(null, { status: 500 })
      if (pathname.endsWith('/revenuecat/sync'))
        return Response.json({ synced: true })
      return Response.json({ flux: 1200, capacitorRechargesAt: null, fallbackToFlux: false, ...wallet })
    })
  })

  afterEach(() => {
    cleanup()
    disposePinia(pinia)
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  async function openSignedIn(path = '/settings/flux') {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
    await router.push(path)
    const now = new Date()
    useAuthStore(pinia).$patch({
      user: { id: 'owner', name: 'Owner', email: 'owner@example.com', emailVerified: true, createdAt: now, updatedAt: now },
      session: { id: 'session-owner', userId: 'owner', token: 'owner-token', createdAt: now, updatedAt: now, expiresAt: new Date(Date.now() + 60_000) },
      token: 'owner-token',
    })
    return render(FluxPage, {
      global: { plugins: [pinia, router, createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: false, fallbackWarn: false })] },
    })
  }

  it('opens on the subscription offer, then the packs with the balance, then the history', async () => {
    const screen = await openSignedIn()

    await expect.element(screen.getByTestId('capacitor-offer')).toHaveTextContent('No Capacitor yet')
    expect(screen.getByTestId('capacitor-hero').elements()).toHaveLength(0)
    await expect.element(screen.getByRole('button', { name: '500 Flux $3.00' })).toBeVisible()
    await expect.element(screen.getByTestId('flux-balance')).toHaveTextContent('Balance 1,200 Flux')
    await expect.element(screen.getByTestId('flux-history')).toBeVisible()
    // The page leads with the subscription: it comes before the one-time packs.
    const subscription = screen.getByTestId('flux-subscription').element()
    const packages = screen.getByTestId('flux-packages').element()
    expect(subscription.compareDocumentPosition(packages) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('draws the usage of the window as the fill of the Capacitor card', async () => {
    const hour = 3_600_000
    const startedAt = new Date(Date.now() - 12 * hour)
    wallet = { capacitorPercent: 62 }
    usage = {
      startedAt: startedAt.toISOString(),
      endsAt: new Date(startedAt.getTime() + 24 * hour).toISOString(),
      records: [{ at: new Date(startedAt.getTime() + 6 * hour).toISOString(), percent: 80 }],
    }
    const screen = await openSignedIn()

    await expect.element(screen.getByTestId('capacitor-percent')).toHaveAccessibleName('Capacitor: 62% left')
    await expect.element(screen.getByTestId('capacitor-curve')).toBeInTheDocument()
    // Half of the window used 38 percent, so the forecast leaves 24 percent.
    await expect.element(screen.getByTestId('capacitor-forecast')).toHaveTextContent('about 24% is left')
    expect(screen.getByTestId('capacitor-offer').elements()).toHaveLength(0)
  })

  it('keeps the percent as a plain fill when the usage read fails', async () => {
    wallet = { capacitorPercent: 40 }
    usage = null
    const screen = await openSignedIn()

    await expect.element(screen.getByTestId('capacitor-percent')).toHaveAccessibleName('Capacitor: 40% left')
    expect(screen.getByTestId('capacitor-curve').elements()).toHaveLength(0)
    expect(screen.getByTestId('capacitor-forecast').elements()).toHaveLength(0)
  })

  it('shows the result after a Stripe checkout returns', async () => {
    wallet = { capacitorPercent: 40 }
    const screen = await openSignedIn('/settings/flux?success=true')

    await expect.element(screen.getByRole('button', { name: '500 Flux $3.00' })).toBeVisible()
    await expect.element(screen.getByText('Payment successful! Your Flux has been topped up.')).toBeVisible()
  })
})

describe('flux order receipts', () => {
  let pinia: ReturnType<typeof createPinia>
  let originalUrl: string
  let receiptResponse: ReturnType<typeof vi.fn<() => Promise<Response>>>
  let requests: { path: string, authorization: string | null }[]

  beforeEach(() => {
    originalUrl = window.location.href
    pinia = createPinia()
    requests = []
    receiptResponse = vi.fn(async () => Response.json({ error: 'PAYMENT_RECEIPT_UNAVAILABLE' }, { status: 503 }))
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : input)
      if (url.pathname.endsWith('/stripe/packages'))
        return Response.json([])
      if (url.pathname.endsWith('/flux/stats'))
        return Response.json({ capacity: 500 })
      if (url.pathname.endsWith('/flux/history')) {
        return Response.json({
          records: [
            { id: 'tx-stripe', type: 'credit', description: 'Stripe recharge', paymentOrderId: 'stripe-order' },
            { id: 'tx-apple', type: 'credit', description: 'Apple recharge', paymentOrderId: 'apple-order' },
            { id: 'tx-usage', type: 'debit', description: 'Usage', paymentOrderId: null },
          ].map(record => ({ ...record, amount: 100, metadata: null, createdAt: '2026-11-03T00:00:00Z' })),
          hasMore: false,
        })
      }
      if (url.pathname.includes('/payments/')) {
        requests.push({ path: url.pathname, authorization: new Headers(init?.headers).get('authorization') })
        return receiptResponse()
      }
      if (url.pathname.endsWith('/flux'))
        return Response.json({ flux: 400, capacitorPercent: null, capacitorRechargesAt: null, fallbackToFlux: false })
      throw new Error(`Unexpected request: ${url}`)
    })

    const now = new Date()
    useAuthStore(pinia).$patch({
      user: { id: 'buyer', name: 'Buyer', email: 'buyer@example.com', emailVerified: true, createdAt: now, updatedAt: now },
      session: { id: 'buyer-session', userId: 'buyer', token: 'buyer-token', createdAt: now, updatedAt: now, expiresAt: new Date(Date.now() + 60_000) },
      token: 'buyer-token',
    })
  })

  afterEach(() => {
    cleanup()
    disposePinia(pinia)
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    localStorage.clear()
    window.history.replaceState(null, '', originalUrl)
  })

  async function openHistory(width: number) {
    await page.viewport(width, 900)
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
    await router.push('/')
    return render(FluxPage, {
      global: { plugins: [pinia, router, createI18n({ legacy: false, locale: 'en', messages: { en } })] },
    })
  }

  it.each([1280, 390])('opens the whole recharge record and retries with the keyboard at width %s', async (width) => {
    const screen = await openHistory(width)
    const buttons = screen.getByRole('button', { name: 'View order' })
    await expect.element(buttons.nth(0)).toBeVisible()
    expect(buttons.elements()).toHaveLength(2)

    const button = buttons.nth(0).element()
    const label = buttons.nth(0).getByText('View order', { exact: true })
    if (width >= 640)
      await expect.element(label).not.toBeVisible()
    else
      await expect.element(label).toBeVisible()
    const description = screen.getByText('Stripe recharge', { exact: true }).elements().find(element => element.getBoundingClientRect().width > 0)!
    const record = width >= 640 ? description.closest('tr')! : description.parentElement!
    const recordBounds = record.getBoundingClientRect()
    const buttonBounds = button.getBoundingClientRect()
    expect(buttonBounds.width).toBeGreaterThanOrEqual(recordBounds.width - 2)
    expect(buttonBounds.height).toBeGreaterThanOrEqual(recordBounds.height - 2)

    const pendingReceipt = Promise.withResolvers<Response>()
    receiptResponse.mockReturnValueOnce(pendingReceipt.promise)
    await buttons.nth(0).click({ position: { x: 12, y: 12 } })
    await expect.element(buttons.nth(0)).toBeDisabled()
    expect(requests).toEqual([{ path: '/api/v1/payments/stripe-order/receipt', authorization: 'Bearer buyer-token' }])

    pendingReceipt.resolve(Response.json({ error: 'PAYMENT_RECEIPT_UNAVAILABLE' }, { status: 503 }))
    await expect.element(screen.getByRole('status')).toHaveTextContent('Failed to open the order. Try again.')
    await expect.element(buttons.nth(0)).toBeEnabled()
    button.focus()
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => requests.map(request => request.path)).toEqual([
      '/api/v1/payments/stripe-order/receipt',
      '/api/v1/payments/stripe-order/receipt',
    ])
  })

  it('opens the original Apple order with new purchases disabled', async () => {
    vi.stubEnv('VITE_DISABLE_FLUX_PURCHASE', 'true')
    const destination = new URL('#apple-order', originalUrl).href
    receiptResponse.mockResolvedValue(Response.json({ url: destination }))
    const screen = await openHistory(390)

    const record = screen.getByRole('button', { name: 'View order' }).nth(1)
    await expect.element(record).toBeVisible()
    record.element().focus()
    await userEvent.keyboard(' ')

    await expect.poll(() => window.location.href).toBe(destination)
    expect(requests).toEqual([{ path: '/api/v1/payments/apple-order/receipt', authorization: 'Bearer buyer-token' }])
  })
})

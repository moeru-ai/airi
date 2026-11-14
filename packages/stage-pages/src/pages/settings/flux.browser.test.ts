import en from '@proj-airi/i18n/locales/en'

import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
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

  it('shows the subscription offer, the packs with the balance, and the history link', async () => {
    const screen = await openSignedIn()

    await expect.element(screen.getByTestId('capacitor-offer')).toHaveTextContent('No Capacitor yet')
    expect(screen.getByTestId('capacitor-hero').elements()).toHaveLength(0)
    await expect.element(screen.getByRole('button', { name: '500 Flux $3.00' })).toBeVisible()
    await expect.element(screen.getByTestId('flux-balance')).toHaveTextContent('Balance 1,200 Flux')
    const historyLink = screen.getByRole('link', { name: 'Transaction History View detailed usage', exact: true })
    await expect.element(historyLink).toHaveAttribute('href', '/settings/usage')
    const subscription = screen.getByTestId('flux-subscription').element()
    const packages = screen.getByTestId('flux-packages').element()
    expect(subscription.compareDocumentPosition(packages) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(packages.compareDocumentPosition(historyLink.element()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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

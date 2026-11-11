import en from '@proj-airi/i18n/locales/en'

import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import FluxPage from './flux.vue'

import 'virtual:uno.css'

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
    // A signed-out visitor sees only the packages, so there is nothing to switch between.
    expect(screen.getByTestId('flux-tabs').elements()).toHaveLength(0)

    await screen.getByRole('button', { name: '500 Flux $3.00' }).click()

    expect(requestLogin).toHaveBeenCalledOnce()
  })
})

describe('flux page with the Capacitor subscription', () => {
  let pinia: ReturnType<typeof createPinia>
  let wallet: { capacitorPercent: number | null }

  beforeEach(() => {
    pinia = createPinia()
    // A desktop build sells the Capacitor through a browser purchase link, so the test needs no RevenueCat SDK.
    vi.stubEnv('VITE_REVENUECAT_WEB_KEY', '')
    vi.stubEnv('VITE_REVENUECAT_PURCHASE_LINK', 'https://pay.example.com/link')
    vi.stubEnv('VITE_DISABLE_FLUX_PURCHASE', 'false')
    wallet = { capacitorPercent: null }
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const { pathname } = new URL(input instanceof Request ? input.url : input.toString())
      if (pathname.endsWith('/stripe/packages'))
        return Response.json([{ stripePriceId: 'price_flux_500', label: '500 Flux', defaultCurrency: 'usd', currencies: { usd: '$3.00' } }])
      if (pathname.endsWith('/flux/history'))
        return Response.json({ records: [], hasMore: false })
      if (pathname.endsWith('/flux/stats'))
        return Response.json({ capacity: 0 })
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

  it('opens on the subscription tab and keeps the packages and history on their own tabs', async () => {
    const screen = await openSignedIn()

    await expect.element(screen.getByTestId('capacitor-section')).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Subscribe in browser', exact: true })).toBeVisible()
    expect(screen.getByTestId('flux-packages').elements()).toHaveLength(0)
    expect(screen.getByTestId('flux-history').elements()).toHaveLength(0)

    await screen.getByRole('radio', { name: 'Flux', exact: true }).click()

    await expect.element(screen.getByRole('button', { name: '500 Flux $3.00' })).toBeVisible()
    await expect.element(screen.getByTestId('capacitor-section')).not.toBeVisible()

    await screen.getByRole('radio', { name: 'History', exact: true }).click()

    await expect.element(screen.getByTestId('flux-history')).toBeVisible()
    expect(screen.getByTestId('flux-packages').elements()).toHaveLength(0)
  })

  it('opens the Flux tab after a Stripe checkout returns', async () => {
    wallet = { capacitorPercent: 40 }
    const screen = await openSignedIn('/settings/flux?success=true')

    await expect.element(screen.getByRole('button', { name: '500 Flux $3.00' })).toBeVisible()
    await expect.element(screen.getByText('Payment successful! Your Flux has been topped up.')).toBeVisible()
    await expect.element(screen.getByTestId('capacitor-section')).not.toBeVisible()
  })
})

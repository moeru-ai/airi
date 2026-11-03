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

    await screen.getByRole('button', { name: '500 Flux $3.00' }).click()

    expect(requestLogin).toHaveBeenCalledOnce()
  })
})

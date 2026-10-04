import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { createI18n } from 'vue-i18n'

import FluxPricing from './flux-pricing.vue'

import 'virtual:uno.css'

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        settings: {
          pages: {
            flux: {
              packagesError: 'Failed to load packages.',
              checkout: { error: 'Checkout failed.' },
              packages: {
                title: 'Flux Packages',
                buy: 'Buy',
                signInToBuy: 'Sign in to buy',
                oneTime: 'One-time purchase',
                recommended: 'Recommended',
                empty: 'No packages are available.',
                packageAction: '{action} {package} for {price}',
              },
            },
          },
        },
      },
    },
  })
}

describe('flux pricing', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('shows current package prices before authentication', async () => {
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (!url.endsWith('/api/v1/stripe/packages'))
        throw new Error(`Unexpected request: ${url}`)

      return Response.json([
        {
          stripePriceId: 'price_flux_500',
          label: '500 Flux',
          defaultCurrency: 'usd',
          currencies: { usd: '$5.00', cny: '¥36.00' },
          recommended: true,
        },
      ])
    })

    const screen = await render(FluxPricing, {
      props: { entrySurface: 'public_pricing' },
      global: { plugins: [createPinia(), createTestI18n()] },
    })

    await expect.element(screen.getByRole('heading', { name: '500 Flux' })).toBeVisible()
    await expect.element(screen.getByText('$5.00', { exact: true })).toBeVisible()
    await expect.element(screen.getByText('One-time purchase', { exact: true })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Sign in to buy 500 Flux for $5.00' })).toBeVisible()
  })
})

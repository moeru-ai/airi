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
                buySelected: 'Continue to checkout',
                signInToBuy: 'Sign in to buy',
                signInToContinue: 'Sign in to continue',
                oneTime: 'One-time purchase',
                recommended: 'Recommended',
                selected: '{package} selected · {price}',
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
        },
        {
          stripePriceId: 'price_flux_2000',
          label: '2000 Flux',
          defaultCurrency: 'usd',
          currencies: { usd: '$12.00', cny: '¥86.00' },
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
    expect(screen.getByText('One-time purchase', { exact: true }).elements()).toHaveLength(2)
    await expect.element(screen.getByRole('radio', { name: /2000 Flux/ })).toHaveAttribute('aria-checked', 'true')
    await expect.element(screen.getByRole('button', { name: 'Sign in to buy 2000 Flux for $12.00' })).toBeVisible()
    await expect.element(screen.getByText('Sign in to continue', { exact: true })).toBeVisible()

    await screen.getByRole('radio', { name: /500 Flux/ }).click()

    await expect.element(screen.getByRole('radio', { name: /500 Flux/ })).toHaveAttribute('aria-checked', 'true')
    await expect.element(screen.getByRole('button', { name: 'Sign in to buy 500 Flux for $5.00' })).toBeVisible()
    expect(screen.getByText('Sign in to continue', { exact: true }).elements()).toHaveLength(1)
  })
})

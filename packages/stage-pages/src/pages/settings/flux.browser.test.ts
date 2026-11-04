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
    localStorage.clear()
    vi.unstubAllEnvs()
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
            { id: 'tx-gift', type: 'promo', description: 'Gift', paymentOrderId: null },
            { id: 'tx-initial', type: 'initial', description: 'Initial grant', paymentOrderId: null },
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
    expect(button.getAttribute('title')).toBe('View order')
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

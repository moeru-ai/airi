import type { Page } from 'playwright'

import { defineStageTamagotchiScenario } from '../context'

export async function installBillingFixtures(page: Page) {
  const requests: string[] = []
  const state = { authenticated: true, mode: 'ready', requests, receiptFails: true }
  await page.context().addInitScript(() => {
    localStorage.setItem('auth/v1/token', 'billing-scenario-token')
    localStorage.setItem('settings/language', 'en')
    localStorage.setItem('settings/analytics/enabled', 'false')
  })
  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/'))
      return route.continue()
    state.requests.push(url.pathname + url.search)
    const send = (body: unknown, status = 200) => route.fulfill({ status, json: body })
    const createdAt = '2026-11-01T00:00:00.000Z'
    if (url.pathname.endsWith('/get-session')) {
      return send(state.authenticated
        ? {
            user: { id: 'billing-owner', name: 'Example account', email: 'user@example.com', emailVerified: true, createdAt, updatedAt: createdAt },
            session: { id: 'billing-session', token: 'billing-scenario-token', userId: 'billing-owner', createdAt, updatedAt: createdAt, expiresAt: '2099-01-01T00:00:00.000Z' },
          }
        : null)
    }
    if (url.pathname.endsWith('/list-accounts'))
      return send([])
    if (url.pathname.endsWith('/stripe/packages')) {
      return send([{ stripePriceId: 'fixture-500', label: '500 Flux', defaultCurrency: 'usd', currencies: { usd: '$3.00', cny: '¥20.00' } }])
    }
    if (url.pathname.endsWith('/revenuecat/catalog'))
      return send({ resetInterval: 'week', capacitors: [{ productId: 'fixture_monthly', quota: 1000 }, { productId: 'fixture_plus', quota: 3000 }] })
    if (url.pathname.endsWith('/revenuecat/sync'))
      return send({ synced: true })
    if (url.pathname.endsWith('/flux/history')) {
      return send({ records: [
        { id: 'wallet-credit', type: 'credit', amount: 2000, description: 'Flux top-up', metadata: null, createdAt },
        { id: 'wallet-debit', type: 'debit', amount: 1, description: 'Usage', metadata: null, createdAt },
      ], hasMore: false })
    }
    if (url.pathname.endsWith('/flux/stats'))
      return send({ capacity: 2000 })
    if (url.pathname.endsWith('/flux'))
      return send({ flux: 1200, capacitorPercent: 62, capacitorRechargesAt: '2026-11-22T00:00:00Z', fallbackToFlux: false })
    if (url.pathname.endsWith('/flux/capacitor/usage'))
      return send({ startedAt: '2026-11-15T00:00:00Z', endsAt: '2026-11-22T00:00:00Z', records: [{ at: '2026-11-16T00:00:00Z', percent: 80 }] })
    if (url.pathname.endsWith('/payments') || url.pathname.endsWith('/flux/usage')) {
      if (state.mode === 'error')
        return send({ error: 'FIXTURE_UNAVAILABLE' }, 503)
      if (state.mode === 'empty')
        return send({ records: [], hasMore: false })
      const offset = Number(url.searchParams.get('offset') ?? 0)
      if (url.pathname.endsWith('/payments')) {
        return send({
          records: [{ id: `order-${offset}`, processor: offset ? 'apple_iap' : 'stripe', status: 'paid', amount: offset ? 4990 : 6000, currency: 'usd', fluxAmount: 2000, creditedAt: null, createdAt }],
          hasMore: offset === 0,
        })
      }
      return send({
        records: [{ id: `usage-${offset}`, sourceType: offset ? 'tts' : 'llm', sourceId: `request-${offset}`, amountMicroFlux: offset ? 0 : 123456, createdAt }],
        hasMore: offset === 0,
      })
    }
    if (url.pathname.endsWith('/receipt'))
      return state.receiptFails ? send({ error: 'PAYMENT_RECEIPT_UNAVAILABLE' }, 503) : send({ url: 'https://example.com/receipt' })
    return send({ records: [], hasMore: false })
  })
  return state
}

export async function checkBillingAndUsage(
  page: Page,
  navigate: (path: string) => Promise<unknown>,
  capture: (name: string, page: Page) => Promise<unknown>,
) {
  const state = await installBillingFixtures(page)
  await page.reload()
  await navigate('/settings/flux')
  const history = page.getByTestId('payment-history')
  await history.getByText('USD 60.00').filter({ visible: true }).first().waitFor()
  await page.evaluate(() => document.fonts.ready)
  if (state.requests.some(path => path.includes('/receipt') || path.includes('/flux/history') || path.includes('/flux/usage')))
    throw new Error('Billing fetched an unrelated resource before a receipt click')
  await capture('billing-ready', page)

  const viewReceipt = history.getByRole('button', { name: 'View receipt' }).filter({ visible: true }).first()
  await viewReceipt.focus()
  await page.keyboard.press('Enter')
  await history.getByText('Failed to open the receipt. Try again.').waitFor()
  await capture('billing-receipt-error', page)
  await viewReceipt.focus()
  await page.keyboard.press('Space')
  await viewReceipt.and(page.locator(':enabled')).waitFor()
  if (state.requests.filter(path => path.endsWith('/receipt')).length !== 2)
    throw new Error('Receipt retry did not request a fresh destination')

  await history.getByRole('button', { name: 'Load more' }).click()
  await history.getByText('USD 4.99').filter({ visible: true }).first().waitFor()
  await navigate('/settings/usage')
  await page.getByTestId('flux-usage').getByText(/0\.123456/).filter({ visible: true }).first().waitFor()
  await capture('usage-ready', page)
  await page.getByRole('button', { name: 'Load more' }).click()
  await page.getByTestId('flux-usage').getByText('Speech', { exact: true }).filter({ visible: true }).first().waitFor()
  const listReads = state.requests.filter(path => path.includes('/payments?') || path.includes('/flux/usage?')).length
  await page.getByRole('link', { name: 'Billing & Invoices', exact: true }).click()
  await page.getByTestId('payment-history').getByText('USD 4.99').filter({ visible: true }).first().waitFor()
  await page.getByRole('link', { name: /Usage/ }).click()
  await page.getByTestId('flux-usage').getByText('Speech', { exact: true }).filter({ visible: true }).first().waitFor()
  if (state.requests.filter(path => path.includes('/payments?') || path.includes('/flux/usage?')).length !== listReads)
    throw new Error('Fresh cached lists were fetched again during navigation')
  await capture('usage-paginated', page)

  state.mode = 'empty'
  await page.reload()
  await page.getByText('No usage records yet.').waitFor()
  await capture('usage-empty', page)
  await navigate('/settings/flux')
  await page.getByText('No receipts yet.').waitFor()
  await capture('billing-empty', page)

  state.mode = 'error'
  await page.reload()
  await page.getByText('Failed to load receipts.').waitFor()
  await capture('billing-error', page)
  state.mode = 'ready'
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await page.getByTestId('payment-history').getByText('USD 60.00').filter({ visible: true }).first().waitFor()

  state.authenticated = false
  await page.reload()
  await page.getByRole('button', { name: '500 Flux $3.00' }).waitFor()
  await capture('billing-public', page)
  await navigate('/settings/usage')
  await page.getByText('Sign in to view your Flux usage.').waitFor()
  await capture('usage-signed-out', page)
}

export default defineStageTamagotchiScenario({
  id: 'settings-billing-and-usage',
  async run({ capture, stageWindows, controlsIsland, settingsWindow }) {
    const main = await stageWindows.waitFor('main')
    await controlsIsland.waitForReady(main.page)
    await controlsIsland.expand(main.page)
    const settings = await controlsIsland.openSettings(main.page)
    await checkBillingAndUsage(settings.page, path => settingsWindow.goToRoute(settings.page, path), capture)
  },
})

import en from '@proj-airi/i18n/locales/en'

import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

import FluxPage from '../flux.vue'
import UsagePage from '../usage.vue'
import AccountSettingsPage from './account-settings-page.vue'

import 'virtual:uno.css'

// Better Auth captures fetch during module initialization. Keep its requests on the same mocked network boundary.
const network = vi.hoisted(() => {
  const original = globalThis.fetch
  const fetch = vi.fn<typeof original>((...args) => original(...args))
  globalThis.fetch = fetch
  return { original, fetch }
})

const now = '2026-11-03T04:00:00.000Z'
const days = Array.from({ length: 365 }, (_, index) => ({
  date: new Date(Date.UTC(2026, 10, 3) - (364 - index) * 86_400_000).toISOString().slice(0, 10),
  microFlux: index === 364 ? 2_000_000 : 0,
}))
const history = Array.from({ length: 20 }, (_, index) => {
  const amount = index < 2 ? index + 2 : 1
  return {
    id: `record-${index}`,
    type: 'debit',
    amount,
    description: 'usage_settlement',
    metadata: { source: 'usage.settlement', usageId: `usage-${index}`, unsettledBefore: amount * 1_000_000, unsettledAfter: 0 },
    createdAt: new Date(Date.parse(now) - index * 60_000).toISOString(),
  }
})

let pinia: ReturnType<typeof createPinia>
let requests: URL[]
let failNextPage: boolean
let dailyResponse: (token: string) => Promise<Response>
let historyResponse: (offset: number, token: string) => Promise<Response>

beforeEach(async () => {
  await page.viewport(1100, 900)
  localStorage.clear()
  pinia = createPinia()
  setActivePinia(pinia)
  requests = []
  failNextPage = false
  dailyResponse = async () => Response.json({ days, longestSessionMs: 90 * 60_000 })
  historyResponse = async (offset) => {
    if (offset === 0)
      return Response.json({ records: history, hasMore: true })
    if (failNextPage) {
      failNextPage = false
      return Response.json({ error: 'Unavailable' }, { status: 503 })
    }
    return Response.json({
      records: [{ ...history[0], id: 'last-record', type: 'credit', amount: 500, description: 'Stripe payment', metadata: { source: 'payment' }, createdAt: new Date(Date.parse(now) - 20 * 60_000).toISOString() }],
      hasMore: false,
    })
  }
  network.fetch.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input)
    const token = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).get('authorization') ?? ''
    requests.push(url)
    if (url.pathname.endsWith('/get-session')) {
      const id = token.includes('other-token') ? 'other' : 'owner'
      return Response.json({
        user: { id, name: id, email: `${id}@example.com`, emailVerified: true, createdAt: now, updatedAt: now },
        session: { id: `session-${id}`, userId: id, token: `${id}-token`, createdAt: now, updatedAt: now, expiresAt: '2027-01-01T00:00:00.000Z' },
      })
    }
    if (url.pathname.endsWith('/list-accounts'))
      return Response.json([])
    if (url.pathname.endsWith('/flux/usage/daily'))
      return dailyResponse(token)
    if (url.pathname.endsWith('/flux/history'))
      return historyResponse(Number(url.searchParams.get('offset')), token)
    if (url.pathname.endsWith('/flux/stats'))
      return Response.json({ capacity: 500 })
    if (url.pathname.endsWith('/stripe/packages'))
      return Response.json([{ stripePriceId: 'price_500', label: '500 Flux', defaultCurrency: 'usd', currencies: { usd: '$3.00' } }])
    if (url.pathname.endsWith('/flux'))
      return Response.json({ flux: 150, capacitorPercent: null, capacitorRechargesAt: null, fallbackToFlux: false })
    throw new Error(`Unexpected request: ${url.pathname}`)
  })
})

afterEach(() => {
  cleanup()
  disposePinia(pinia)
  localStorage.clear()
  network.fetch.mockImplementation((...args) => network.original(...args))
  vi.restoreAllMocks()
})

afterAll(() => {
  globalThis.fetch = network.original
})

async function openPage(path = '/settings/account') {
  const auth = useAuthStore(pinia)
  await auth.completeSignIn({ accessToken: 'owner-token', expiresIn: 3600, clientId: 'browser-test' })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings/account', component: AccountSettingsPage },
      { path: '/settings/usage', component: UsagePage },
      { path: '/settings/flux', component: FluxPage },
    ],
  })
  await router.push(path)
  const screen = await render(RouterView, {
    global: { plugins: [pinia, router, createI18n({ legacy: false, locale: 'en', messages: { en } })] },
  })
  return { screen, auth, router }
}

describe('account usage navigation', () => {
  it('opens separate history from the account overview and preserves records across pagination and retry', async () => {
    const { screen, router } = await openPage()
    await expect.element(screen.getByRole('img', { name: 'Daily Flux usage' })).toBeVisible()
    for (const label of ['Flux used', 'Peak daily Flux', 'Longest session', 'Longest streak', 'Current streak'])
      await expect.element(screen.getByText(label, { exact: true })).toBeVisible()
    expect([...screen.container.querySelectorAll('dd')].map(element => element.textContent?.trim())).toEqual(['2', '2', '1.5h', '1d', '1d'])
    expect(requests.some(url => url.pathname.endsWith('/flux/history'))).toBe(false)
    expect(requests.some(url => url.pathname.endsWith('/stripe/packages'))).toBe(false)

    await screen.getByRole('link', { name: 'View detailed usage' }).click()
    await expect.poll(() => router.currentRoute.value.path).toBe('/settings/usage')
    await expect.element(screen.getByRole('table')).toBeVisible()
    expect(screen.getByRole('img').elements()).toHaveLength(0)
    expect(screen.getByRole('button', { name: '500 Flux $3.00' }).elements()).toHaveLength(0)
    await expect.element(screen.getByRole('cell', { name: '-2', exact: true })).toBeVisible()
    expect(screen.getByRole('row').elements()).toHaveLength(21)

    failNextPage = true
    await screen.getByRole('button', { name: 'Load More' }).click()
    await expect.element(screen.getByText('Failed to load usage data. Try again.')).toBeVisible()
    await expect.element(screen.getByRole('cell', { name: '-2', exact: true })).toBeVisible()
    expect(screen.getByRole('row').elements()).toHaveLength(21)
    await screen.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect.element(screen.getByRole('cell', { name: 'Stripe payment', exact: true })).toBeVisible()
    expect(requests.filter(url => url.pathname.endsWith('/flux/history')).map(url => url.searchParams.get('offset'))).toEqual(['0', '20', '20'])
    expect(screen.getByRole('button', { name: 'Load More' }).elements()).toHaveLength(0)
  })

  it('opens history directly from charging without loading usage on the charging page', async () => {
    const { screen, router } = await openPage('/settings/flux')
    await expect.element(screen.getByRole('button', { name: '500 Flux $3.00' })).toBeVisible()
    expect(requests.some(url => url.pathname.endsWith('/flux/usage/daily'))).toBe(false)
    expect(requests.some(url => url.pathname.endsWith('/flux/history'))).toBe(false)
    expect(screen.getByRole('img').elements()).toHaveLength(0)
    expect(screen.getByRole('table').elements()).toHaveLength(0)

    await screen.getByRole('link', { name: 'View detailed usage', exact: true }).click()
    await expect.poll(() => router.currentRoute.value.path).toBe('/settings/usage')
    await expect.element(screen.getByRole('table')).toBeVisible()
    expect(screen.getByRole('img').elements()).toHaveLength(0)
    expect(requests.some(url => url.pathname.endsWith('/flux/usage/daily'))).toBe(false)
  })

  it('keeps the history link available when no usage or session has been recorded', async () => {
    dailyResponse = async () => Response.json({ days: days.map(day => ({ ...day, microFlux: 0 })), longestSessionMs: 0 })
    const { screen } = await openPage()
    await expect.element(screen.getByText('No usage yet.')).toBeVisible()
    await expect.element(screen.getByRole('link', { name: 'View detailed usage' })).toBeVisible()
    expect(screen.getByRole('img').elements()).toHaveLength(0)
  })

  it('shows a recorded session even when requests incurred no fee', async () => {
    dailyResponse = async () => Response.json({ days: days.map(day => ({ ...day, microFlux: 0 })), longestSessionMs: 60_000 })
    const { screen } = await openPage()
    await expect.element(screen.getByText('1m', { exact: true })).toBeVisible()
    await expect.element(screen.getByRole('img', { name: 'Daily Flux usage' })).toBeVisible()
    expect(screen.getByText('No usage yet.').elements()).toHaveLength(0)
  })

  it('discards a pending overview when the account changes', async () => {
    const pending = Promise.withResolvers<Response>()
    dailyResponse = async token => token.includes('owner-token')
      ? pending.promise
      : Response.json({ days, longestSessionMs: 60_000 })
    const { screen, auth } = await openPage()
    await expect.poll(() => requests.some(url => url.pathname.endsWith('/flux/usage/daily'))).toBe(true)
    await auth.completeSignIn({ accessToken: 'other-token', expiresIn: 3600, clientId: 'browser-test' })
    await expect.element(screen.getByRole('img', { name: 'Daily Flux usage' })).toBeVisible()
    pending.resolve(Response.json({ days: days.map(day => ({ ...day, microFlux: 999_000_000 })), longestSessionMs: 999 * 60_000 }))
    await screen.getByRole('button', { name: 'Weekly', exact: true }).click()
    await expect.element(screen.getByText('1m', { exact: true })).toBeVisible()
  })

  it('isolates pending history across account changes and sign-out', async () => {
    const pending = Promise.withResolvers<Response>()
    const otherHistory = [{ ...history[0], id: 'other-credit', type: 'credit', amount: 500, description: 'Other account top up', metadata: { source: 'payment' } }]
    historyResponse = async (_offset, token) => token.includes('owner-token')
      ? pending.promise
      : Response.json({ records: otherHistory, hasMore: false })
    const { screen, auth } = await openPage('/settings/usage')
    await expect.poll(() => requests.some(url => url.pathname.endsWith('/flux/history'))).toBe(true)
    await auth.completeSignIn({ accessToken: 'other-token', expiresIn: 3600, clientId: 'browser-test' })
    const otherRecord = screen.getByRole('cell', { name: 'Other account top up', exact: true })
    await expect.element(otherRecord).toBeVisible()
    pending.resolve(Response.json({ records: history, hasMore: true }))
    await otherRecord.click()
    await expect.element(otherRecord).toBeVisible()
    expect(screen.getByRole('cell', { name: '-2', exact: true }).elements()).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Load More' }).elements()).toHaveLength(0)
    await auth.clearAllAuthState()
    await expect.element(screen.getByRole('link', { name: 'Sign in to view your usage records' })).toBeVisible()
    expect(screen.getByRole('table').elements()).toHaveLength(0)
  })

  it('keeps history readable as cards on mobile', async () => {
    await page.viewport(390, 844)
    const { screen } = await openPage('/settings/usage')
    await expect.element(screen.getByRole('list').getByText('-2', { exact: true })).toBeVisible()
    expect(screen.getByRole('listitem').elements()).toHaveLength(20)
    const root = screen.container.firstElementChild as HTMLElement
    expect(root.scrollWidth).toBeLessThanOrEqual(390)
  })
})

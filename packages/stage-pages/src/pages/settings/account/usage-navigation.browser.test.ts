import en from '@proj-airi/i18n/locales/en'

import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { page } from 'vitest/browser'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'

import FluxPage from '../flux.vue'
import UsagePage from '../usage.vue'
import AccountSettingsPage from './account-settings-page.vue'

import 'virtual:uno.css'

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
let dailyResponse: () => Promise<Response>
let historyResponse: (offset: number) => Promise<Response>

beforeEach(async () => {
  await page.viewport(1100, 900)
  localStorage.clear()
  pinia = createPinia()
  setActivePinia(pinia)
  requests = []
  failNextPage = false
  dailyResponse = async () => Response.json({ days })
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
  const fetch: typeof globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : input)
    requests.push(url)
    if (url.pathname.endsWith('/list-accounts'))
      return Response.json([])
    if (url.pathname.endsWith('/flux/usage/daily'))
      return dailyResponse()
    if (url.pathname.endsWith('/flux/history'))
      return historyResponse(Number(url.searchParams.get('offset')))
    if (url.pathname.endsWith('/flux/stats'))
      return Response.json({ capacity: 500 })
    if (url.pathname.endsWith('/stripe/packages'))
      return Response.json([{ stripePriceId: 'price_500', label: '500 Flux', defaultCurrency: 'usd', currencies: { usd: '$3.00' } }])
    if (url.pathname.endsWith('/flux'))
      return Response.json({ flux: 150, capacitorPercent: null, capacitorRechargesAt: null, fallbackToFlux: false })
    throw new Error(`Unexpected request: ${url.pathname}`)
  }
  vi.stubGlobal('fetch', fetch)
})

afterEach(() => {
  cleanup()
  disposePinia(pinia)
  localStorage.clear()
  vi.unstubAllGlobals()
})

function seedSession(verified: boolean) {
  const auth = useAuthStore(pinia)
  const id = 'owner'
  const date = new Date(now)
  const version = auth.sessionVersion + 1
  auth.$patch({
    user: { id, name: id, email: `${id}@example.com`, emailVerified: true, createdAt: date, updatedAt: date },
    session: { id: `session-${id}`, userId: id, token: `${id}-token`, createdAt: date, updatedAt: date, expiresAt: new Date(Date.now() + 60_000) },
    token: `${id}-token`,
    sessionVersion: version,
    verifiedSessionVersion: verified ? version : 0,
  })
  return auth
}

async function openPage(path = '/settings/account', verified = true) {
  const auth = seedSession(verified)
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
    await expect.element(screen.getByRole('listbox', { name: 'Daily Flux usage' })).toBeVisible()
    expect(requests.some(url => url.pathname.endsWith('/flux/history'))).toBe(false)
    expect(requests.some(url => url.pathname.endsWith('/stripe/packages'))).toBe(false)

    await screen.getByRole('link', { name: 'View detailed usage' }).click()
    await expect.poll(() => router.currentRoute.value.path).toBe('/settings/usage')
    await expect.element(screen.getByRole('cell', { name: '-2', exact: true })).toBeVisible()

    failNextPage = true
    await screen.getByRole('button', { name: 'Load More' }).click()
    await expect.element(screen.getByText('Failed to load usage data. Try again.')).toBeVisible()
    await expect.element(screen.getByRole('cell', { name: '-2', exact: true })).toBeVisible()
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

    await screen.getByRole('link', { name: 'Transaction History View detailed usage', exact: true }).click()
    await expect.poll(() => router.currentRoute.value.path).toBe('/settings/usage')
    await expect.element(screen.getByRole('table')).toBeVisible()
    expect(requests.some(url => url.pathname.endsWith('/flux/usage/daily'))).toBe(false)
  })

  it('keeps the history link available when no fees have been recorded', async () => {
    dailyResponse = async () => Response.json({ days: days.map(day => ({ ...day, microFlux: 0 })) })
    const { screen } = await openPage()
    await expect.element(screen.getByText('No usage yet.')).toBeVisible()
    await expect.element(screen.getByRole('link', { name: 'View detailed usage' })).toBeVisible()
  })

  it('shows loading until verification, then unmounts history on sign-out', async () => {
    const { screen, auth } = await openPage('/settings/usage', false)
    await expect.element(screen.getByRole('status')).toHaveTextContent('Loading history')
    expect(requests.some(url => url.pathname.endsWith('/flux/history'))).toBe(false)
    auth.$patch({ verifiedSessionVersion: auth.sessionVersion })
    await expect.element(screen.getByRole('table')).toBeVisible()
    await auth.clearAllAuthState()
    await expect.element(screen.getByRole('link', { name: 'Sign in to view your usage records' })).toBeVisible()
    expect(screen.getByRole('table').elements()).toHaveLength(0)
  })

  it.each([1100, 390])('preserves request details and collapsible TTS history at %ipx', async (width) => {
    await page.viewport(width, 900)
    historyResponse = async () => Response.json({
      records: [
        { ...history[0], description: 'chat completion', metadata: { promptTokens: 6200, completionTokens: 1800 } },
        { ...history[1], description: 'tts:speech', metadata: { model: 'speech-model' } },
        { ...history[2], description: 'tts:speech', metadata: { model: 'speech-model' } },
        { ...history[3], description: 'tts:other', metadata: { model: 'other-model' } },
      ],
      hasMore: false,
    })
    const { screen } = await openPage('/settings/usage')
    const view = screen.getByRole(width === 1100 ? 'table' : 'list')
    await expect.element(view.getByText('(6200+1800 tokens)', { exact: true })).toBeVisible()
    await expect.element(view.getByText('(other-model)', { exact: true })).toBeVisible()
    expect(screen.container.scrollWidth).toBeLessThanOrEqual(width)
    const group = view.getByRole('button', { name: 'tts:speech (2 requests)', exact: true })
    await expect.element(group).toHaveAttribute('aria-expanded', 'false')
    await group.click()
    await expect.element(group).toHaveAttribute('aria-expanded', 'true')
    await expect.element(view.getByText('-3', { exact: true })).toBeVisible()
    await group.click()
    expect(view.getByText('-3', { exact: true }).elements()).toHaveLength(0)
  })
})

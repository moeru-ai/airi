import en from '@proj-airi/i18n/locales/en'

import { configureAnalyticsAdapter } from '@proj-airi/stage-ui/libs/product-signals'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useSettingsAnalytics } from '@proj-airi/stage-ui/stores/settings/analytics'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { page, userEvent } from 'vitest/browser'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import AccountSettingsPage from './account-settings-page.vue'

import 'virtual:uno.css'

// Better Auth captures fetch at initialization; intercept only the external network boundary.
const network = vi.hoisted(() => {
  const original = globalThis.fetch
  const fetch = vi.fn<typeof original>((...args) => original(...args))
  globalThis.fetch = fetch
  return { original, fetch }
})

const capture = vi.fn((_name: string, _properties: object) => true)
beforeAll(() => {
  configureAnalyticsAdapter(async () => ({
    capture,
    getIdentitySnapshot: () => null,
    identify: () => {},
    registerBuildInfo: () => {},
    resetIdentity: () => {},
    setCaptureEnabled: () => true,
  }))
})

let pinia: ReturnType<typeof createPinia>
let deletion: ReturnType<typeof vi.fn<() => Promise<Response>>>
let requests: RequestInit[]

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  vi.stubEnv('VITE_ENABLE_ANALYTICS', 'true')
  capture.mockClear()
  requests = []
  deletion = vi.fn(async () => Response.json({ success: true, message: 'User deleted' }))
  network.fetch.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input)
    if (url.pathname.endsWith('/delete-account')) {
      requests.push(init ?? {})
      return deletion()
    }
    if (url.pathname.endsWith('/list-accounts'))
      return Response.json([])
    return Response.json({ flux: 150, capacitorPercent: null, capacitorRechargesAt: null, fallbackToFlux: false })
  })
})

afterEach(() => {
  cleanup()
  disposePinia(pinia)
  localStorage.clear()
  network.fetch.mockImplementation((...args) => network.original(...args))
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

afterAll(() => {
  globalThis.fetch = network.original
})

/** Renders the real account page with an authenticated account and network-only test doubles. */
async function openDeletion(email = 'person@example.com') {
  const store = useAuthStore()
  const now = new Date()
  store.$patch({
    user: { id: 'owner', name: 'Owner', email, emailVerified: true, createdAt: now, updatedAt: now },
    session: { id: 'session-owner', userId: 'owner', token: 'owner-token', createdAt: now, updatedAt: now, expiresAt: new Date(Date.now() + 60_000) },
    token: 'owner-token',
  })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
  await router.push('/')
  const onLogin = vi.fn()
  const screen = render(AccountSettingsPage, {
    props: { onLogin },
    global: { plugins: [pinia, router, createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: false, fallbackWarn: false })] },
  })
  await screen.getByRole('button', { name: 'Delete account', exact: true }).click()
  return { screen, store, onLogin }
}

describe('unified account deletion', () => {
  // https://github.com/moeru-ai/airi/pull/2895#discussion_r4245563897
  it.each(['person@example.com', 'id@steam.placeholder.local', ''])('requires confirmation for %s and clears local auth only after success', async (email) => {
    const { screen, store } = await openDeletion(email)
    const confirm = screen.getByRole('button', { name: 'Delete permanently', exact: true })
    await expect.element(confirm).toBeDisabled()
    const field = screen.getByRole('dialog').getByRole('textbox')
    await field.fill(email === 'person@example.com' ? email : 'DELETE')
    await confirm.click()
    await expect.poll(() => store.isAuthenticated).toBe(false)
    expect(requests).toHaveLength(1)
    expect(JSON.parse(String(requests[0].body))).toEqual({ confirm: true })
    expect(new Headers(requests[0].headers).get('authorization')).toBe('Bearer owner-token')
    await expect.element(screen.getByRole('status')).toHaveTextContent('Your account has been deleted.')
    expect(capture.mock.calls.map(call => call[0])).toEqual(['account_deletion_requested', 'account_deletion_completed'])
  })

  it('starts login for a stale session without automatically retrying deletion', async () => {
    deletion.mockResolvedValue(Response.json({ code: 'SESSION_NOT_FRESH' }, { status: 403 }))
    const { screen, store, onLogin } = await openDeletion()
    await screen.getByRole('dialog').getByRole('textbox').fill('person@example.com')
    await screen.getByRole('button', { name: 'Delete permanently' }).click()
    await expect.element(screen.getByRole('alert')).toHaveTextContent('Sign in again')
    expect(store.isAuthenticated).toBe(true)
    await screen.getByRole('button', { name: 'Sign in again', exact: true }).click()
    await expect.poll(() => onLogin.mock.calls.length).toBe(1)
    expect(store.isAuthenticated).toBe(false)
    expect(requests).toHaveLength(1)
  })

  it('keeps the account and confirmation when a subscription blocks deletion', async () => {
    deletion.mockResolvedValue(Response.json({ code: 'SUBSCRIPTION_ACTIVE' }, { status: 409 }))
    const { screen, store } = await openDeletion()
    await screen.getByRole('dialog').getByRole('textbox').fill('person@example.com')
    await screen.getByRole('button', { name: 'Delete permanently' }).click()
    await expect.element(screen.getByRole('alert')).toHaveTextContent('Cancel it on the Capacitor page')
    expect(store.isAuthenticated).toBe(true)
    expect(capture.mock.calls.map(call => call[0])).toEqual(['account_deletion_requested'])
  })

  // https://github.com/moeru-ai/airi/pull/2895#discussion_r4245563894
  it('keeps a pending deletion open through Escape and outside clicks, then handles success', async () => {
    let finish: (response: Response) => void = () => {}
    deletion.mockImplementation(() => new Promise((resolve) => {
      finish = resolve
    }))
    const { screen, store } = await openDeletion()
    await screen.getByRole('dialog').getByRole('textbox').fill('person@example.com')
    await screen.getByRole('button', { name: 'Delete permanently' }).click()
    await expect.poll(() => requests.length).toBe(1)
    await expect.element(screen.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    await expect.element(screen.getByRole('dialog')).toHaveAttribute('data-state', 'open')
    await page.getByTestId('account-deletion-overlay').click({ position: { x: 1, y: 1 } })
    await expect.element(screen.getByRole('dialog')).toHaveAttribute('data-state', 'open')
    expect(requests[0].signal?.aborted).toBe(false)
    expect(capture.mock.calls.map(call => call[0])).toEqual(['account_deletion_requested'])
    finish(Response.json({ success: true }))
    await expect.poll(() => store.isAuthenticated).toBe(false)
    expect(capture.mock.calls.map(call => call[0])).toEqual(['account_deletion_requested', 'account_deletion_completed'])
  })

  it('does not capture deletion events when analytics is disabled', async () => {
    useSettingsAnalytics().analyticsEnabled = false
    const { screen, store } = await openDeletion()
    await screen.getByRole('dialog').getByRole('textbox').fill('person@example.com')
    await screen.getByRole('button', { name: 'Delete permanently' }).click()
    await expect.poll(() => store.isAuthenticated).toBe(false)
    expect(capture).not.toHaveBeenCalled()
  })

  it('ignores deletion results after switching accounts', async () => {
    let finish: (response: Response) => void = () => {}
    deletion.mockImplementation(() => new Promise((resolve) => {
      finish = resolve
    }))
    const { screen, store } = await openDeletion()
    await screen.getByRole('dialog').getByRole('textbox').fill('person@example.com')
    await screen.getByRole('button', { name: 'Delete permanently' }).click()
    await expect.poll(() => requests.length).toBe(1)
    store.sessionVersion += 1
    store.user = { ...store.user!, id: 'other', email: 'other@example.com' }
    finish(Response.json({ success: true }))
    await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument()
    expect(store.user.id).toBe('other')
    expect(store.isAuthenticated).toBe(true)
  })
})

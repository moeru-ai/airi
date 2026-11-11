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
let accountChange: ReturnType<typeof vi.fn<(path: string) => Promise<Response>>>
let linkedAccounts: object[]
let listAccounts: ReturnType<typeof vi.fn<() => Promise<Response>>>
let tokenRefresh: ReturnType<typeof vi.fn<() => Promise<Response>>>
let requests: RequestInit[]
/** Path and `Authorization` header of every auth request, in send order. */
let authRequests: Array<{ path: string, authorization: string | null }>

beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  vi.stubEnv('VITE_ENABLE_ANALYTICS', 'true')
  capture.mockClear()
  requests = []
  authRequests = []
  deletion = vi.fn(async () => Response.json({ success: true, message: 'User deleted' }))
  linkedAccounts = []
  accountChange = vi.fn(async () => Response.json({ status: true, redirect: false }))
  listAccounts = vi.fn(async () => Response.json(linkedAccounts))
  tokenRefresh = vi.fn(async () => Response.json({ access_token: 'renewed-token', refresh_token: 'renewed-refresh', token_type: 'Bearer', expires_in: 3600 }))
  network.fetch.mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input)
    if (url.pathname.startsWith('/api/auth/'))
      authRequests.push({ path: url.pathname, authorization: new Headers(init?.headers).get('authorization') })
    if (url.pathname.endsWith('/delete-account')) {
      requests.push(init ?? {})
      return deletion()
    }
    if (url.pathname.endsWith('/list-accounts'))
      return listAccounts()
    if (url.pathname.endsWith('/link-social') || url.pathname.endsWith('/unlink-account'))
      return accountChange(url.pathname)
    if (url.pathname.endsWith('/oauth2/token'))
      return tokenRefresh()
    if (url.pathname.endsWith('/get-session'))
      return Response.json({ user: { id: 'owner', name: 'Owner', email: 'person@example.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() }, session: { id: 'session-owner', userId: 'owner', token: 'renewed-token', createdAt: new Date(), updatedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) } })
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
async function renderSignedIn(email = 'person@example.com') {
  const store = useAuthStore()
  const now = new Date()
  store.$patch({
    user: { id: 'owner', name: 'Owner', email, emailVerified: true, createdAt: now, updatedAt: now },
    session: { id: 'session-owner', userId: 'owner', token: 'owner-token', createdAt: now, updatedAt: now, expiresAt: new Date(Date.now() + 60_000) },
    token: 'owner-token',
    refreshToken: 'owner-refresh',
    oidcClientId: 'test-client',
  })
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }] })
  await router.push('/')
  const onLogin = vi.fn()
  const screen = render(AccountSettingsPage, {
    props: { onLogin },
    global: { plugins: [pinia, router, createI18n({ legacy: false, locale: 'en', messages: { en }, missingWarn: false, fallbackWarn: false })] },
  })
  return { screen, store, onLogin }
}

/** Renders the signed-in account page and opens the deletion dialog. */
async function openDeletion(email = 'person@example.com') {
  const rendered = await renderSignedIn(email)
  await rendered.screen.getByRole('button', { name: 'Delete account', exact: true }).click()
  return rendered
}

describe('sync section', () => {
  it('shows each sync on by default and saves a change on this device', async () => {
    const { screen } = await renderSignedIn()
    const switches = screen.getByRole('switch')
    const providers = screen.getByRole('switch', { name: 'Providers' })

    await expect.element(providers).toHaveAttribute('aria-checked', 'true')
    expect(switches.elements()).toHaveLength(4)
    for (const item of switches.elements())
      expect(item.getAttribute('aria-checked')).toBe('true')

    await providers.click()

    await expect.element(providers).toHaveAttribute('aria-checked', 'false')
    await expect.poll(() => JSON.parse(localStorage.getItem('settings/sync') ?? '{}')).toEqual({ providers: false })
  })
})

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
    await expect.element(screen.getByRole('alert')).toHaveTextContent('Cancel it on the Subscription page')
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

describe('connected accounts', () => {
  it('offers a new sign-in when the server needs an active session to link an account', async () => {
    accountChange.mockResolvedValue(Response.json({ code: 'SESSION_REQUIRED', message: 'Sign in again before you link an account.' }, { status: 403 }))
    const { screen, store, onLogin } = await renderSignedIn()
    const github = screen.getByRole('listitem').filter({ hasText: 'GitHub' })

    await github.getByRole('button', { name: 'Link', exact: true }).click()

    await expect.element(screen.getByRole('alert')).toHaveTextContent('Sign in again before you link or unlink an account.')
    expect(accountChange).toHaveBeenCalledWith(expect.stringMatching(/\/link-social$/))
    expect(store.isAuthenticated).toBe(true)
    await screen.getByRole('button', { name: 'Sign in again', exact: true }).click()
    await expect.poll(() => onLogin.mock.calls.length).toBe(1)
    expect(store.isAuthenticated).toBe(false)
  })

  it('offers a new sign-in when the server needs a fresh session to unlink an account', async () => {
    const createdAt = new Date().toISOString()
    linkedAccounts = [
      { id: 'account-1', accountId: 'github-1', providerId: 'github', createdAt, scopes: [] },
      { id: 'account-2', accountId: 'owner', providerId: 'credential', createdAt, scopes: [] },
    ]
    accountChange.mockResolvedValue(Response.json({ code: 'SESSION_NOT_FRESH', message: 'Session is not fresh' }, { status: 403 }))
    const { screen, onLogin } = await renderSignedIn()
    const github = screen.getByRole('listitem').filter({ hasText: 'GitHub' })

    await github.getByRole('button', { name: 'Unlink', exact: true }).click()

    await expect.element(screen.getByRole('alert')).toHaveTextContent('Sign in again before you link or unlink an account.')
    await screen.getByRole('button', { name: 'Sign in again', exact: true }).click()
    await expect.poll(() => onLogin.mock.calls.length).toBe(1)
  })

  it('shows no sign-in action for other link failures', async () => {
    accountChange.mockResolvedValue(Response.json({ code: 'PROVIDER_NOT_FOUND', message: 'Provider not found' }, { status: 404 }))
    const { screen } = await renderSignedIn()
    const github = screen.getByRole('listitem').filter({ hasText: 'GitHub' })

    await github.getByRole('button', { name: 'Link', exact: true }).click()

    await expect.element(screen.getByRole('alert')).toHaveTextContent('Provider not found')
    expect(screen.getByRole('button', { name: 'Sign in again', exact: true }).elements()).toHaveLength(0)
  })
})

describe('account requests after an expired access token', () => {
  // ROOT CAUSE:
  //
  // Better Auth client calls used the plain fetch. A 401 on an account call
  // failed without a token refresh, until the next scheduled refresh.
  //
  // We fixed this by passing `authedFetch` to the account calls whose 401 means an expired token.
  it('refreshes the token once and retries the account list with the new token', async () => {
    listAccounts.mockResolvedValueOnce(Response.json({ message: 'Unauthorized' }, { status: 401 }))
    const { store } = await renderSignedIn()

    await expect.poll(() => listAccounts.mock.calls.length).toBe(2)
    expect(tokenRefresh).toHaveBeenCalledTimes(1)
    expect(authRequests.filter(request => request.path.endsWith('/list-accounts')).map(request => request.authorization)).toEqual(['Bearer owner-token', 'Bearer renewed-token'])
    await expect.poll(() => store.token).toBe('renewed-token')
    expect(store.isAuthenticated).toBe(true)
  })

  it('expires the session when the refresh after an account 401 is rejected', async () => {
    // A desktop runtime keeps the login request in the store instead of leaving the test page.
    vi.stubEnv('RUNTIME_ENVIRONMENT', 'electron')
    listAccounts.mockResolvedValue(Response.json({ message: 'Unauthorized' }, { status: 401 }))
    tokenRefresh.mockResolvedValue(Response.json({ error: 'invalid_grant' }, { status: 400 }))
    const { store } = await renderSignedIn()

    await expect.poll(() => store.needsLogin).toBe(true)
    expect(tokenRefresh).toHaveBeenCalledTimes(1)
    expect(listAccounts).toHaveBeenCalledTimes(1)
    expect(store.token).toBeNull()
    expect(store.isAuthenticated).toBe(false)
  })

  // `/delete-account` uses Better Auth's `sensitiveSessionMiddleware`. It answers 401 for a valid
  // token without an active session. A refresh cannot fix that, and its second 401 signs the user out.
  it('keeps the session without a refresh when deletion answers 401', async () => {
    deletion.mockResolvedValue(Response.json({ code: 'UNAUTHORIZED' }, { status: 401 }))
    const { screen, store } = await openDeletion()
    await screen.getByRole('dialog').getByRole('textbox').fill('person@example.com')
    await screen.getByRole('button', { name: 'Delete permanently' }).click()

    await expect.element(screen.getByRole('alert')).toHaveTextContent('Sign in again')
    expect(requests).toHaveLength(1)
    expect(tokenRefresh).not.toHaveBeenCalled()
    expect(store.token).toBe('owner-token')
    expect(store.isAuthenticated).toBe(true)
    expect(store.needsLogin).toBe(false)
  })
})

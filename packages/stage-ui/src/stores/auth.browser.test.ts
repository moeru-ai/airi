import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'

import { authedFetch } from '../libs/auth-fetch'
import { useAuthStore } from './auth'

// Better Auth captures fetch when the client is created. Keep its real client,
// but forward its network boundary to the fetch controlled by each test.
vi.mock('better-auth/vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('better-auth/vue')>()
  return {
    ...actual,
    createAuthClient: (options: Parameters<typeof actual.createAuthClient>[0]) => actual.createAuthClient({
      ...options,
      fetchOptions: { ...options?.fetchOptions, customFetchImpl: (...args) => globalThis.fetch(...args) },
    }),
  }
})

describe('authentication request ownership', () => {
  let pinia: ReturnType<typeof createPinia>
  const requests: Array<{ path: string, resolve: (response: Response) => void }> = []

  beforeEach(() => {
    localStorage.clear()
    requests.length = 0
    pinia = createPinia()
    setActivePinia(pinia)
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = input instanceof Request ? input.url : input.toString()
      if (url.includes('/flux'))
        return Promise.resolve(Response.json({ flux: 0 }))
      return new Promise(resolve => requests.push({ path: new URL(url).pathname, resolve }))
    })
  })

  afterEach(() => {
    disposePinia(pinia)
    vi.restoreAllMocks()
    localStorage.clear()
  })

  async function reply(path: string, body: unknown, status = 200) {
    await vi.waitFor(() => expect(requests.map(request => request.path)).toContain(path))
    const index = requests.findIndex(request => request.path === path)
    requests.splice(index, 1)[0]!.resolve(Response.json(body, { status }))
  }

  function identity(id: string) {
    return {
      user: { id, name: id, email: `${id}@example.test`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
      session: { id, userId: id, token: id, expiresAt: new Date(Date.now() + 3600000), createdAt: new Date(), updatedAt: new Date() },
    }
  }

  async function signIn(id: string) {
    const result = useAuthStore().completeSignIn({ accessToken: id, refreshToken: `${id}-refresh`, clientId: 'test-client', expiresIn: 3600 })
    await reply('/api/auth/get-session', identity(id))
    await result
  }

  it('consumes one login request across synchronized renderers without snapshot writeback', async () => {
    vi.stubEnv('RUNTIME_ENVIRONMENT', 'electron')
    const namespace = `auth-races-${crypto.randomUUID()}`
    const onError = vi.fn()
    const leader = createSyncedPiniaPlugin({ namespace, leadership: 'leader-only', onError })
    const follower = createSyncedPiniaPlugin({ namespace, leadership: 'follower-only', onError })
    const followerPinia = createPinia().use(follower.plugin)
    pinia.use(leader.plugin)
    createApp({}).use(pinia)
    createApp({}).use(followerPinia)
    const owner = useAuthStore(pinia)
    const replica = useAuthStore(followerPinia)
    try {
      await expect.poll(() => leader.isLeader()).toBe(true)
      owner.needsLogin = true
      await expect.poll(() => replica.needsLogin).toBe(true)
      const results = await Promise.all([owner.consumeLoginRequest(), replica.consumeLoginRequest()])
      expect(results.filter(Boolean)).toHaveLength(1)
      await expect.poll(() => replica.needsLogin).toBe(false)
      const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage')
      await owner.clearAllAuthState()
      await expect.poll(() => replica.sessionVersion).toBe(owner.sessionVersion)
      await nextTick()
      expect(traffic.mock.calls.filter(([message]) => JSON.stringify(message).includes('replaceState'))).toHaveLength(0)
      expect(onError).not.toHaveBeenCalled()
    }
    finally {
      leader.dispose()
      follower.dispose()
      disposePinia(followerPinia)
      vi.unstubAllEnvs()
    }
  })

  // ROOT CAUSE:
  // An old session response wrote identity after logout cleared the credentials.
  // The response must belong to the current authentication version before it commits.
  it('ignores a session response after local authentication is cleared', async () => {
    await signIn('first')
    const store = useAuthStore()
    const pending = store.fetchSession()
    await store.clearAllAuthState()
    await reply('/api/auth/get-session', identity('first'))
    await pending
    expect(store.isAuthenticated).toBe(false)
    expect(store.token).toBeNull()
  })

  it('does not let an old rejected session clear a newer sign-in', async () => {
    await signIn('first')
    const store = useAuthStore()
    const pending = store.fetchSession()
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    const oldRequest = requests.shift()!
    await signIn('second')
    oldRequest.resolve(Response.json(null))
    await pending
    expect(store.user?.id).toBe('second')
    expect(store.token).toBe('second')
  })

  it('does not restore credentials when a refresh completes after logout', async () => {
    await signIn('first')
    const store = useAuthStore()
    const pending = store.refreshTokenNow()
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    await store.clearAllAuthState()
    await reply('/api/auth/oauth2/token', { access_token: 'late', refresh_token: 'late-refresh', expires_in: 3600 })
    // A stale refresh must finish without requesting a session with the discarded token.
    await vi.waitFor(() => expect(store.token).toBeNull())
    expect(await pending).toBeNull()
    expect(localStorage.getItem('auth/v1/token')).toBeNull()
  })

  it('refreshes the current session and keeps the new credential', async () => {
    await signIn('first')
    const store = useAuthStore()
    const pending = store.refreshTokenNow()
    await reply('/api/auth/oauth2/token', { access_token: 'renewed', refresh_token: 'renewed-refresh', expires_in: 3600 })
    await reply('/api/auth/get-session', identity('first'))
    expect(await pending).toBe('renewed')
    expect(store.token).toBe('renewed')
    expect(store.user?.id).toBe('first')
  })

  it('does not let a failed old refresh clear a newer sign-in', async () => {
    await signIn('first')
    const store = useAuthStore()
    const pending = store.refreshTokenNow()
    await signIn('second')
    await reply('/api/auth/oauth2/token', { error: 'invalid_grant' }, 400)
    await pending
    expect(store.user?.id).toBe('second')
    expect(store.token).toBe('second')
  })

  it('does not clear a new sign-in when an earlier logout finishes', async () => {
    await signIn('first')
    const store = useAuthStore()
    const pending = store.signOut()
    await signIn('second')
    await reply('/api/auth/sign-out', {})
    await pending
    expect(store.user?.id).toBe('second')
  })

  it('does not prompt for login when an API refresh finishes after logout', async () => {
    await signIn('first')
    const store = useAuthStore()
    const pending = authedFetch('https://api.example.test/action')
    await reply('/action', {}, 401)
    await vi.waitFor(() => expect(requests.map(request => request.path)).toContain('/api/auth/oauth2/token'))
    await store.clearAllAuthState()
    await reply('/api/auth/oauth2/token', { error: 'invalid_grant' }, 400)
    expect((await pending).status).toBe(401)
    expect(store.needsLogin).toBe(false)
    expect(store.isAuthenticated).toBe(false)
  })

  it('requests login when the current API refresh fails', async () => {
    vi.stubEnv('RUNTIME_ENVIRONMENT', 'electron')
    try {
      await signIn('first')
      const pending = authedFetch('https://api.example.test/action')
      await reply('/action', {}, 401)
      await reply('/api/auth/oauth2/token', { error: 'invalid_grant' }, 400)
      expect((await pending).status).toBe(401)
      expect(useAuthStore().needsLogin).toBe(true)
      expect(useAuthStore().token).toBeNull()
    }
    finally {
      vi.unstubAllEnvs()
    }
  })

  it('does not retry an old API request under a new account after a late 401', async () => {
    await signIn('first')
    const pending = authedFetch('https://api.example.test/action', { method: 'POST' })
    await signIn('second')
    await reply('/action', {}, 401)
    expect((await pending).status).toBe(401)
    expect(useAuthStore().user?.id).toBe('second')
    expect(requests).toHaveLength(0)
  })
})

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
  const requests: Array<{ path: string, body?: BodyInit | null, resolve: (response: Response) => void, reject: (error: Error) => void }> = []

  beforeEach(() => {
    localStorage.clear()
    requests.length = 0
    pinia = createPinia()
    setActivePinia(pinia)
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = input instanceof Request ? input.url : input.toString()
      if (url.includes('/flux'))
        return Promise.resolve(Response.json({ flux: 0 }))
      return new Promise((resolve, reject) => requests.push({ path: new URL(url).pathname, body: init?.body, resolve, reject }))
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

  async function failNetwork(path: string) {
    await vi.waitFor(() => expect(requests.map(request => request.path)).toContain(path))
    const index = requests.findIndex(request => request.path === path)
    requests.splice(index, 1)[0]!.reject(new TypeError('Failed to fetch'))
  }

  function identity(id: string) {
    return {
      user: { id, name: id, email: `${id}@example.test`, emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
      session: { id, userId: id, token: id, expiresAt: new Date(Date.now() + 3600000), createdAt: new Date(), updatedAt: new Date() },
    }
  }

  async function signIn(id: string, idToken?: string) {
    const result = useAuthStore().completeSignIn({ accessToken: id, refreshToken: `${id}-refresh`, idToken, clientId: 'test-client', expiresIn: 3600 })
    await reply('/api/auth/get-session', identity(id))
    await result
  }

  it('publishes a follower login request on the leader before it can be consumed', async () => {
    vi.stubEnv('RUNTIME_ENVIRONMENT', 'electron')
    const namespace = `auth-login-request-${crypto.randomUUID()}`
    const leader = createSyncedPiniaPlugin({ namespace, leadership: 'leader-only' })
    const follower = createSyncedPiniaPlugin({ namespace, leadership: 'follower-only' })
    const followerPinia = createPinia().use(follower.plugin)
    pinia.use(leader.plugin)
    createApp({}).use(pinia)
    createApp({}).use(followerPinia)
    const owner = useAuthStore(pinia)
    const replica = useAuthStore(followerPinia)
    try {
      await expect.poll(() => leader.isLeader()).toBe(true)
      await expect.poll(() => follower.getLeaderId()).toBe(leader.participantId)
      const traffic = vi.spyOn(BroadcastChannel.prototype, 'postMessage')

      await replica.requestLogin()

      expect(owner.needsLogin).toBe(true)
      expect(await owner.consumeLoginRequest()).toBe(true)
      expect(await replica.consumeLoginRequest()).toBe(false)
      expect(traffic.mock.calls.filter(([message]) => JSON.stringify(message).includes('replaceState'))).toHaveLength(0)
    }
    finally {
      leader.dispose()
      follower.dispose()
      disposePinia(followerPinia)
      vi.unstubAllEnvs()
    }
  })

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

  // ROOT CAUSE:
  // A new sign-in may receive the same opaque token. Token equality alone cannot
  // prevent a response from the previous sign-in from clearing the new identity.
  it('ignores an old rejection when a new sign-in reuses the same token', async () => {
    await signIn('first')
    const store = useAuthStore()
    const pending = store.fetchSession()
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    const oldRequest = requests.shift()!
    await signIn('first')
    oldRequest.resolve(Response.json(null))
    await pending
    expect(store.user?.id).toBe('first')
    expect(store.token).toBe('first')
  })

  // ROOT CAUSE:
  // Refresh keeps the login generation but replaces its credential. An old
  // credential's rejection must not clear the successfully refreshed session.
  it('ignores an old rejection after token rotation in the same session', async () => {
    await signIn('first')
    const store = useAuthStore()
    const pending = store.fetchSession()
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    const oldRequest = requests.shift()!
    const refresh = store.refreshTokenNow()
    await reply('/api/auth/oauth2/token', { access_token: 'renewed', expires_in: 3600 })
    await reply('/api/auth/get-session', identity('first'))
    await refresh
    oldRequest.resolve(Response.json(null))
    await pending
    expect(store.user?.id).toBe('first')
    expect(store.token).toBe('renewed')
  })

  function fetchInit(path: string): RequestInit | undefined {
    return vi.mocked(globalThis.fetch).mock.calls.find(([input]) => new URL(input instanceof Request ? input.url : input.toString()).pathname === path)?.[1]
  }

  // ROOT CAUSE:
  //
  // Sign-out waited for every server step before it cleared local state, and no
  // request had a timeout. A slow or unreachable server kept the user signed in.
  //
  // Sign-out now clears local state first and ends the server session in the background.
  it('clears local state before the server answers sign-out', async () => {
    await signIn('first')
    const store = useAuthStore()
    await store.signOut()
    expect(store.isAuthenticated).toBe(false)
    expect(store.token).toBeNull()
    expect(localStorage.getItem('auth/v1/refresh-token')).toBeNull()
    expect(requests.map(request => request.path).sort()).toEqual(['/api/auth/oauth2/revoke', '/api/auth/sign-out'])
    expect(await store.refreshTokenNow()).toBeNull()
    expect(await store.fetchSession()).toBe(false)
    expect(requests).toHaveLength(2)
    await reply('/api/auth/oauth2/revoke', {})
    await reply('/api/auth/sign-out', {})
  })

  // ROOT CAUSE:
  //
  // Sign-out only ended the server session. The refresh grant does not check
  // the session, so a copied refresh token kept issuing access tokens.
  //
  // Sign-out now revokes the refresh token (RFC 7009) and ends the session.
  it('revokes the refresh token and ends the server session with keepalive requests', async () => {
    await signIn('first', 'first-id-token')
    const store = useAuthStore()
    await store.signOut()
    expect(requests.map(request => request.path).sort()).toEqual(['/api/auth/oauth2/end-session', '/api/auth/oauth2/revoke'])
    const revoke = requests.find(request => request.path === '/api/auth/oauth2/revoke')!
    const body = new URLSearchParams(String(revoke.body))
    expect(body.get('token')).toBe('first-refresh')
    expect(body.get('token_type_hint')).toBe('refresh_token')
    expect(body.get('client_id')).toBe('test-client')
    // A navigation right after sign-out must not cancel the server steps.
    expect(fetchInit('/api/auth/oauth2/revoke')?.keepalive).toBe(true)
    expect(fetchInit('/api/auth/oauth2/end-session')?.keepalive).toBe(true)
    expect(fetchInit('/api/auth/oauth2/end-session')?.signal).toBeInstanceOf(AbortSignal)
    await reply('/api/auth/oauth2/revoke', {})
    await reply('/api/auth/oauth2/end-session', {})
  })

  it('revokes the rotated refresh token when sign-out starts during a refresh', async () => {
    await signIn('first', 'first-id-token')
    const store = useAuthStore()
    const refresh = store.refreshTokenNow()
    await vi.waitFor(() => expect(requests.map(request => request.path)).toEqual(['/api/auth/oauth2/token']))

    // The provider deletes every refresh token of the user and client when a
    // revoked token is revoked again. Sign-out must not send the rotated-out token.
    const logout = store.signOut()
    await reply('/api/auth/oauth2/token', { access_token: 'renewed', refresh_token: 'renewed-refresh', expires_in: 3600 })
    await reply('/api/auth/get-session', identity('first'))
    await refresh
    await logout

    expect(store.token).toBeNull()
    const revoke = requests.find(request => request.path === '/api/auth/oauth2/revoke')!
    expect(new URLSearchParams(String(revoke.body)).get('token')).toBe('renewed-refresh')
    await reply('/api/auth/oauth2/revoke', {})
    await reply('/api/auth/oauth2/end-session', {})
  })

  it('logs server sign-out failures after local state is cleared', async () => {
    await signIn('first')
    const store = useAuthStore()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    await store.signOut()
    expect(store.isAuthenticated).toBe(false)
    expect(store.token).toBeNull()
    expect(localStorage.getItem('auth/v1/refresh-token')).toBeNull()
    await reply('/api/auth/oauth2/revoke', { error: 'invalid_client' }, 401)
    await reply('/api/auth/sign-out', {}, 500)
    await vi.waitFor(() => {
      expect(errors).toHaveBeenCalledWith('Refresh token revocation failed', 'Token revocation failed: 401')
      expect(errors).toHaveBeenCalledWith('Server sign-out failed', 'Server sign-out failed: 500')
    })
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
    await store.signOut()
    await signIn('second')
    await reply('/api/auth/oauth2/revoke', {})
    await reply('/api/auth/sign-out', {})
    await nextTick()
    expect(store.user?.id).toBe('second')
    expect(store.token).toBe('second')
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

  // ROOT CAUSE:
  //
  // `requestAuthSession` returned null for every error answer, so a 5xx looked
  // like a rejected token. `fetchSession` then cleared the complete auth state.
  //
  // We fixed this by throwing for every error status except 401. The store keeps its state for a thrown error.
  it('keeps the session when get-session answers 503', async () => {
    await signIn('first')
    const store = useAuthStore()
    const pending = store.fetchSession()
    await reply('/api/auth/get-session', { message: 'Service Unavailable' }, 503)
    expect(await pending).toBe(false)
    expect(store.token).toBe('first')
    expect(store.refreshToken).toBe('first-refresh')
    expect(store.user?.id).toBe('first')
  })

  it('keeps the session when get-session cannot reach the server', async () => {
    await signIn('first')
    const store = useAuthStore()
    const pending = store.fetchSession()
    await failNetwork('/api/auth/get-session')
    expect(await pending).toBe(false)
    expect(store.token).toBe('first')
    expect(store.user?.id).toBe('first')
  })

  it('refreshes once when get-session rejects the current token', async () => {
    await signIn('first')
    const store = useAuthStore()
    const pending = store.fetchSession()
    await reply('/api/auth/get-session', null)
    await reply('/api/auth/oauth2/token', { access_token: 'renewed', refresh_token: 'renewed-refresh', expires_in: 3600 })
    await reply('/api/auth/get-session', identity('first'))
    expect(await pending).toBe(true)
    expect(store.token).toBe('renewed')
    expect(store.user?.id).toBe('first')
  })

  it('keeps the credentials without a login request when an API refresh hits a 503', async () => {
    vi.stubEnv('RUNTIME_ENVIRONMENT', 'electron')
    try {
      await signIn('first')
      const store = useAuthStore()
      const pending = authedFetch('https://api.example.test/action')
      await reply('/action', {}, 401)
      await reply('/api/auth/oauth2/token', { error: 'temporarily_unavailable' }, 503)
      expect((await pending).status).toBe(401)
      expect(store.needsLogin).toBe(false)
      expect(store.token).toBe('first')
      expect(store.refreshToken).toBe('first-refresh')
      expect(localStorage.getItem('auth/v1/refresh-token')).toBe('first-refresh')
    }
    finally {
      vi.unstubAllEnvs()
    }
  })
})

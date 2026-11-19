import type { Session, User } from 'better-auth'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { triggerSignIn } from '../libs/auth'
import { requestAuthSession } from '../libs/auth-client'
import { refreshAccessToken, TokenRefreshError } from '../libs/auth-oidc'
import { useAuthStore } from './auth'

vi.mock('../libs/auth', () => ({
  triggerSignIn: vi.fn(),
}))

vi.mock('../libs/auth-client', () => ({
  authClient: {
    listSessions: vi.fn(),
  },
  requestAuthSession: vi.fn(),
}))

vi.mock('../libs/auth-oidc', async importOriginal => ({
  ...await importOriginal<typeof import('../libs/auth-oidc')>(),
  refreshAccessToken: vi.fn(),
}))

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

const user: User = {
  id: 'user-1',
  name: 'AIRI User',
  email: 'user@example.com',
  emailVerified: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

const session: Session = {
  id: 'session-1',
  token: 'server-session-token',
  userId: user.id,
  expiresAt: new Date('2026-12-01T00:00:00.000Z'),
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
}

describe('auth store sign-in requests', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    vi.stubGlobal('localStorage', storage)
    // Authentication also requests credits. Keep that HTTP boundary inside the test.
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ flux: 0 })))
    setActivePinia(createPinia())
    vi.mocked(triggerSignIn).mockReset()
    vi.mocked(triggerSignIn).mockResolvedValue()
    vi.mocked(requestAuthSession).mockReset()
    vi.mocked(requestAuthSession).mockResolvedValue({ user, session })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('allows sign-in to be requested again after an external flow is canceled', async () => {
    const authStore = useAuthStore()

    // ROOT CAUSE:
    //
    // Pocket remains mounted after launching the external login page. If the
    // user returns without authenticating, `needsLogin` used to remain true,
    // so a later click could not produce the transition that triggers sign-in.
    // Consuming each request restores the false -> true transition.
    authStore.needsLogin = true
    await nextTick()

    expect(triggerSignIn).toHaveBeenCalledTimes(1)
    expect(authStore.needsLogin).toBe(false)

    authStore.needsLogin = true
    await nextTick()

    expect(triggerSignIn).toHaveBeenCalledTimes(2)
    expect(authStore.needsLogin).toBe(false)
  })

  it('queries the session with the token from the completed sign-in', async () => {
    const authStore = useAuthStore()

    // ROOT CAUSE:
    //
    // The old callback queried the session through a raw localStorage read.
    // VueUse writes storage on the next microtask, so that request could use
    // the previous token and then clear the complete auth state.
    await authStore.completeSignIn({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      idToken: 'new-id-token',
      expiresIn: 3600,
      clientId: 'airi-stage-electron',
    })

    expect(requestAuthSession).toHaveBeenCalledWith('new-access-token')
    expect(authStore.token).toBe('new-access-token')
    expect(authStore.refreshToken).toBe('new-refresh-token')
    expect(authStore.idToken).toBe('new-id-token')
    expect(authStore.user).toEqual(user)
    expect(authStore.session).toEqual(session)
    expect(storage.getItem('auth/v1/token')).toBe('new-access-token')
    expect(storage.getItem('auth/v1/refresh-token')).toBe('new-refresh-token')
    expect(storage.getItem('auth/v1/oidc-id-token')).toBe('new-id-token')
    expect(storage.getItem('auth/v1/oidc-client-id')).toBe('airi-stage-electron')
    expect(storage.getItem('auth/v1/oidc-token-expiry')).not.toBeNull()

    await authStore.clearAllAuthState()
  })

  it('loads persisted credentials only when the store initializes', async () => {
    storage.values.set('auth/v1/token', 'persisted-access-token')
    storage.values.set('auth/v1/refresh-token', 'persisted-refresh-token')
    storage.values.set('auth/v1/oidc-id-token', 'persisted-id-token')
    storage.values.set('auth/v1/oidc-client-id', 'airi-stage-web')
    storage.values.set('auth/v1/oidc-token-expiry', String(Date.now() + 60_000))
    const authStore = useAuthStore()

    expect(authStore.token).toBeNull()

    await authStore.initialize()

    expect(requestAuthSession).toHaveBeenCalledWith('persisted-access-token')
    expect(authStore.token).toBe('persisted-access-token')
  })

  it('reads the capacitor percent and fallback choice with the Flux balance', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ flux: 5, capacitorPercent: 40, capacitorRechargesAt: '2026-10-11T06:00:00.000Z', fallbackToFlux: true })))
    const authStore = useAuthStore()
    authStore.$patch({ user, session })

    await authStore.updateCredits()

    expect(authStore.credits).toBe(5)
    expect(authStore.capacitorPercent).toBe(40)
    expect(authStore.capacitorRechargesAt).toBe('2026-10-11T06:00:00.000Z')
    expect(authStore.fallbackToFlux).toBe(true)
  })

  it('does not persist state patches received from another window', async () => {
    const authStore = useAuthStore()

    // ROOT CAUSE:
    //
    // `useLocalStorage` observed every Pinia patch and wrote it to storage.
    // The storage event then reached another window, whose synced Pinia patch
    // wrote the same value back. This formed an unbounded cross-window loop.
    // Auth persistence now runs only inside auth commands.
    authStore.$patch({ token: 'synced-access-token' })
    await nextTick()

    expect(storage.values.size).toBe(0)
  })
})

describe('auth store refresh failures', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    vi.useFakeTimers()
    storage = new MemoryStorage()
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ flux: 0 })))
    setActivePinia(createPinia())
    vi.mocked(triggerSignIn).mockReset()
    vi.mocked(triggerSignIn).mockResolvedValue()
    vi.mocked(requestAuthSession).mockReset()
    vi.mocked(requestAuthSession).mockResolvedValue({ user, session })
    vi.mocked(refreshAccessToken).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  async function signIn() {
    const authStore = useAuthStore()
    await authStore.completeSignIn({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      idToken: 'id-token',
      expiresIn: 3600,
      clientId: 'airi-stage-web',
    })
    return authStore
  }

  function expectCredentialsKept(authStore: ReturnType<typeof useAuthStore>, accessToken = 'access-token', refreshToken = 'refresh-token') {
    expect(authStore.token).toBe(accessToken)
    expect(authStore.refreshToken).toBe(refreshToken)
    expect(authStore.oidcClientId).toBe('airi-stage-web')
    expect(storage.getItem('auth/v1/token')).toBe(accessToken)
    expect(storage.getItem('auth/v1/refresh-token')).toBe(refreshToken)
  }

  // ROOT CAUSE:
  //
  // `refreshTokenNow` cleared the auth state for every refresh error.
  // A network blip or a 5xx deleted the refresh token.
  //
  // We fixed this by clearing only on a rejected refresh token (400 or 401).
  // Other failures keep the credentials and retry with a doubling delay.
  it('keeps the credentials and retries when a refresh hits a network error', async () => {
    const authStore = await signIn()
    vi.mocked(refreshAccessToken).mockRejectedValue(new TypeError('Failed to fetch'))

    expect(await authStore.refreshTokenNow()).toBeNull()

    expectCredentialsKept(authStore)
    expect(authStore.isAuthenticated).toBe(true)
    expect(authStore.needsLogin).toBe(false)
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(refreshAccessToken).toHaveBeenCalledTimes(2)

    // The second failure doubles the delay.
    await vi.advanceTimersByTimeAsync(30_000)
    expect(refreshAccessToken).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(refreshAccessToken).toHaveBeenCalledTimes(3)
    expectCredentialsKept(authStore)
  })

  it('keeps the credentials when the token endpoint answers 503', async () => {
    const authStore = await signIn()
    vi.mocked(refreshAccessToken).mockRejectedValue(new TokenRefreshError(503))

    expect(await authStore.refreshTokenNow()).toBeNull()

    expectCredentialsKept(authStore)
    expect(authStore.isAuthenticated).toBe(true)
    expect(triggerSignIn).not.toHaveBeenCalled()
  })

  it('clears the credentials and requests sign-in when the refresh token is rejected', async () => {
    const authStore = await signIn()
    vi.mocked(refreshAccessToken).mockRejectedValue(new TokenRefreshError(400, 'invalid_grant'))

    expect(await authStore.refreshTokenNow()).toBeNull()
    await nextTick()

    expect(authStore.token).toBeNull()
    expect(authStore.refreshToken).toBeNull()
    expect(authStore.isAuthenticated).toBe(false)
    expect(storage.values.size).toBe(0)
    expect(triggerSignIn).toHaveBeenCalledTimes(1)

    // A rejected refresh token stops the retries.
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
  })

  // ROOT CAUSE:
  //
  // A thrown session request after the rotation reached the refresh catch block.
  // Its guard matched the new token, so it cleared the new credentials.
  //
  // We fixed this by treating a session request without an answer as unavailable.
  // The rotated tokens stay.
  it('keeps the rotated tokens when the session request after a refresh fails', async () => {
    const authStore = await signIn()
    vi.mocked(refreshAccessToken).mockResolvedValue({
      access_token: 'rotated-access-token',
      refresh_token: 'rotated-refresh-token',
      token_type: 'Bearer',
      expires_in: 3600,
    })
    vi.mocked(requestAuthSession).mockRejectedValue(new TypeError('Failed to fetch'))

    expect(await authStore.refreshTokenNow()).toBe('rotated-access-token')

    expectCredentialsKept(authStore, 'rotated-access-token', 'rotated-refresh-token')
    expect(authStore.user).toEqual(user)
  })

  // ROOT CAUSE:
  //
  // On startup, a null session for an unexpired token cleared the state.
  // No refresh and no sign-in request happened.
  //
  // We fixed this by refreshing once when the server rejects the access token.
  // A rejected refresh then clears the state and requests sign-in.
  it('refreshes once on startup before it clears a rejected session', async () => {
    storage.values.set('auth/v1/token', 'persisted-access-token')
    storage.values.set('auth/v1/refresh-token', 'persisted-refresh-token')
    storage.values.set('auth/v1/oidc-client-id', 'airi-stage-web')
    storage.values.set('auth/v1/oidc-token-expiry', String(Date.now() + 60_000))
    vi.mocked(requestAuthSession).mockResolvedValue(null)
    vi.mocked(refreshAccessToken).mockRejectedValue(new TokenRefreshError(400, 'invalid_grant'))
    const authStore = useAuthStore()

    await authStore.initialize()
    await nextTick()

    expect(refreshAccessToken).toHaveBeenCalledExactlyOnceWith('airi-stage-web', 'persisted-refresh-token')
    expect(authStore.token).toBeNull()
    expect(storage.values.size).toBe(0)
    expect(triggerSignIn).toHaveBeenCalledTimes(1)
  })

  it('restores the session on startup when the refresh after a rejected session succeeds', async () => {
    storage.values.set('auth/v1/token', 'persisted-access-token')
    storage.values.set('auth/v1/refresh-token', 'persisted-refresh-token')
    storage.values.set('auth/v1/oidc-client-id', 'airi-stage-web')
    storage.values.set('auth/v1/oidc-token-expiry', String(Date.now() + 60_000))
    vi.mocked(requestAuthSession).mockResolvedValueOnce(null)
    vi.mocked(refreshAccessToken).mockResolvedValue({
      access_token: 'rotated-access-token',
      refresh_token: 'rotated-refresh-token',
      token_type: 'Bearer',
      expires_in: 3600,
    })
    const authStore = useAuthStore()

    await authStore.initialize()

    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(requestAuthSession).toHaveBeenLastCalledWith('rotated-access-token')
    expect(authStore.token).toBe('rotated-access-token')
    expect(authStore.isAuthenticated).toBe(true)
  })

  function persistSession(tokenExpiry = Date.now() + 3_600_000) {
    storage.values.set('auth/v1/token', 'persisted-access-token')
    storage.values.set('auth/v1/refresh-token', 'persisted-refresh-token')
    storage.values.set('auth/v1/oidc-client-id', 'airi-stage-web')
    storage.values.set('auth/v1/oidc-token-expiry', String(tokenExpiry))
  }

  // ROOT CAUSE:
  //
  // A session request without an answer left `user` null while the access token stayed valid.
  // Nothing requested the session again until the refresh at 80% of the token lifetime, or a reload.
  //
  // We fixed this by retrying the session request with the refresh backoff.
  it('retries a failed session request on startup and loads the user later', async () => {
    persistSession()
    vi.mocked(requestAuthSession).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const authStore = useAuthStore()

    await authStore.initialize()

    expect(authStore.user).toBeNull()
    expect(authStore.token).toBe('persisted-access-token')

    await vi.advanceTimersByTimeAsync(29_999)
    expect(requestAuthSession).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(requestAuthSession).toHaveBeenCalledTimes(2)
    expect(requestAuthSession).toHaveBeenLastCalledWith('persisted-access-token')
    expect(authStore.user).toEqual(user)
    expect(authStore.isAuthenticated).toBe(true)

    // A definitive answer stops the retry.
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(requestAuthSession).toHaveBeenCalledTimes(2)
    expect(refreshAccessToken).not.toHaveBeenCalled()
  })

  it('retries a failed session request after a startup refresh', async () => {
    persistSession(Date.now() - 1000)
    vi.mocked(refreshAccessToken).mockResolvedValue({
      access_token: 'rotated-access-token',
      refresh_token: 'rotated-refresh-token',
      token_type: 'Bearer',
      expires_in: 3600,
    })
    vi.mocked(requestAuthSession).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const authStore = useAuthStore()

    await authStore.initialize()

    expect(authStore.user).toBeNull()
    expectCredentialsKept(authStore, 'rotated-access-token', 'rotated-refresh-token')

    await vi.advanceTimersByTimeAsync(30_000)
    expect(requestAuthSession).toHaveBeenCalledTimes(2)
    expect(requestAuthSession).toHaveBeenLastCalledWith('rotated-access-token')
    expect(authStore.user).toEqual(user)
    expect(refreshAccessToken).toHaveBeenCalledTimes(1)
  })

  it('doubles the session retry delay and stops the retry on sign-out', async () => {
    persistSession()
    vi.mocked(requestAuthSession).mockRejectedValue(new TypeError('Failed to fetch'))
    const authStore = useAuthStore()

    await authStore.initialize()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(requestAuthSession).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(59_999)
    expect(requestAuthSession).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(requestAuthSession).toHaveBeenCalledTimes(3)

    await authStore.signOut()
    await vi.advanceTimersByTimeAsync(10 * 60_000)

    expect(requestAuthSession).toHaveBeenCalledTimes(3)
    expect(authStore.token).toBeNull()
    expect(storage.values.size).toBe(0)
  })
})

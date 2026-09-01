import type { Session, User } from 'better-auth'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { triggerSignIn } from '../libs/auth'
import { requestAuthSession } from '../libs/auth-client'
import { useAuthStore } from './auth'

vi.mock('../composables/api', () => ({
  client: {
    api: {
      v1: {
        flux: {
          $get: vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ flux: 0 }),
          }),
        },
      },
    },
  },
}))

vi.mock('../composables/use-breakpoints', () => ({
  useBreakpoints: () => ({ isMobile: { value: false } }),
}))

vi.mock('../libs/auth', () => ({
  triggerSignIn: vi.fn(),
}))

vi.mock('../libs/auth-client', () => ({
  authClient: {
    listSessions: vi.fn(),
  },
  requestAuthSession: vi.fn(),
}))

vi.mock('../libs/auth-oidc', () => ({
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

describe('auth store sign-out requests', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    vi.stubGlobal('localStorage', storage)
    setActivePinia(createPinia())
    vi.mocked(requestAuthSession).mockReset()
    vi.mocked(requestAuthSession).mockResolvedValue({ user, session })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function seedOidcSession() {
    const authStore = useAuthStore()
    authStore.$patch({
      user,
      session,
      token: 'access-token',
      idToken: 'id-token',
      oidcClientId: 'airi-stage-web',
    })
    return authStore
  }

  it('keeps local auth state when the OIDC sign-out returns non-2xx', async () => {
    const authStore = seedOidcSession()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad Gateway', { status: 502 })))

    await expect(authStore.signOut()).rejects.toThrow('OIDC sign-out failed: HTTP 502')
    expect(authStore.token).toBe('access-token')
    expect(authStore.isAuthenticated).toBe(true)
  })

  it('keeps local auth state when the bearer fallback returns non-2xx', async () => {
    const authStore = seedOidcSession()
    authStore.$patch({ idToken: null, oidcClientId: null })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Unauthorized', { status: 401 })))

    await expect(authStore.signOut()).rejects.toThrow('Bearer sign-out failed: HTTP 401')
    expect(authStore.token).toBe('access-token')
    expect(authStore.isAuthenticated).toBe(true)
  })

  it('clears local auth state only after a successful server sign-out', async () => {
    const authStore = seedOidcSession()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))

    await authStore.signOut()

    expect(authStore.token).toBeNull()
    expect(authStore.isAuthenticated).toBe(false)
  })

  it('uses the iOS 15 timeout fallback and retains state after an abort', async () => {
    vi.useFakeTimers()
    const authStore = seedOidcSession()
    const timeoutDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'timeout')
    Object.defineProperty(AbortSignal, 'timeout', { configurable: true, value: undefined })

    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('sign-out timed out', 'AbortError')))
    }))
    vi.stubGlobal('fetch', fetchMock)

    try {
      const promise = authStore.signOut()
      promise.catch(() => {})

      await vi.advanceTimersByTimeAsync(8_000)
      await expect(promise).rejects.toThrow('sign-out timed out')
      expect(authStore.token).toBe('access-token')
      expect(authStore.isAuthenticated).toBe(true)
      expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    }
    finally {
      if (timeoutDescriptor)
        Object.defineProperty(AbortSignal, 'timeout', timeoutDescriptor)
      else
        Reflect.deleteProperty(AbortSignal, 'timeout')
    }
  })
})

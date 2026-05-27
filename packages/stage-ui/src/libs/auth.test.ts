import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  return {
    authStore: {
      idToken: 'id-token',
      oidcClientId: 'client-id',
      token: 'access-token',
      clearAllAuthState: vi.fn(),
    },
  }
})

vi.mock('better-auth/vue', () => ({
  createAuthClient: () => ({
    getSession: vi.fn(),
    listSessions: vi.fn(),
    signIn: {
      social: vi.fn(),
    },
  }),
}))

vi.mock('../stores/auth', () => ({
  useAuthStore: () => mocks.authStore,
}))

vi.mock('./server', () => ({
  SERVER_URL: 'https://api.airi.test',
}))

import { SIGN_OUT_REQUEST_TIMEOUT_MS, signOut } from './auth'

describe('signOut', () => {
  beforeEach(() => {
    mocks.authStore.idToken = 'id-token'
    mocks.authStore.oidcClientId = 'client-id'
    mocks.authStore.token = 'access-token'
    mocks.authStore.clearAllAuthState.mockClear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps local auth state after aborting a hung OIDC end-session request', async () => {
    vi.useFakeTimers()

    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('sign-out timed out', 'AbortError'))
        })
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const promise = signOut()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://api.airi.test/api/auth/oauth2/end-session?id_token_hint=id-token&client_id=client-id')
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('GET')
    expect(mocks.authStore.clearAllAuthState).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(SIGN_OUT_REQUEST_TIMEOUT_MS - 1)
    expect(mocks.authStore.clearAllAuthState).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).rejects.toThrow('sign-out timed out')
    expect(mocks.authStore.clearAllAuthState).not.toHaveBeenCalled()
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(true)
  })

  it('still waits for a responsive server sign-out before clearing local state', async () => {
    let resolveFetch!: () => void
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = () => resolve({} as Response)
    }))
    vi.stubGlobal('fetch', fetchMock)

    const promise = signOut()

    expect(mocks.authStore.clearAllAuthState).not.toHaveBeenCalled()
    resolveFetch()
    await promise

    expect(mocks.authStore.clearAllAuthState).toHaveBeenCalledTimes(1)
  })

  it('keeps local auth state when the bearer sign-out fallback times out', async () => {
    vi.useFakeTimers()
    mocks.authStore.idToken = ''
    mocks.authStore.oidcClientId = ''

    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('sign-out timed out', 'AbortError'))
        })
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const promise = signOut()

    await vi.advanceTimersByTimeAsync(SIGN_OUT_REQUEST_TIMEOUT_MS)
    await expect(promise).rejects.toThrow('sign-out timed out')
    expect(mocks.authStore.clearAllAuthState).not.toHaveBeenCalled()
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(true)
  })

  it('clears local auth state when no server sign-out credential is available', async () => {
    mocks.authStore.idToken = ''
    mocks.authStore.oidcClientId = ''
    mocks.authStore.token = ''

    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await signOut()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.authStore.clearAllAuthState).toHaveBeenCalledTimes(1)
  })

  it('applies the same timeout signal to the bearer sign-out fallback', async () => {
    mocks.authStore.idToken = ''
    mocks.authStore.oidcClientId = ''

    const fetchMock = vi.fn(async () => ({} as Response))
    vi.stubGlobal('fetch', fetchMock)

    await signOut()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://api.airi.test/api/auth/sign-out')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer access-token' },
    })
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal).toBeInstanceOf(AbortSignal)
    expect(mocks.authStore.clearAllAuthState).toHaveBeenCalledTimes(1)
  })
})

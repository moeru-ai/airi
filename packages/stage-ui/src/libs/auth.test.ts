import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { signOut } from './auth'

// NOTICE: this constant mirrors `SIGN_OUT_REQUEST_TIMEOUT_MS` in `./auth`,
// which is intentionally kept module-private (per AGENTS.md L231 — do not
// widen exports solely to make private implementation details testable).
// The fake-timer tests below need to drive time across the exact timeout
// boundary, so the value is duplicated here. If you change one, change the
// other; remove this NOTICE when the timeout boundary test is rewritten to
// observe the abort via the public signal rather than by ticking fake time.
const SIGN_OUT_REQUEST_TIMEOUT_MS = 8000

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

describe('signOut', () => {
  beforeEach(() => {
    mocks.authStore.idToken = 'id-token'
    mocks.authStore.oidcClientId = 'client-id'
    mocks.authStore.token = 'access-token'
    mocks.authStore.clearAllAuthState.mockClear()
    vi.restoreAllMocks()
    // NOTICE: `AbortSignal.timeout()` schedules on a native libuv timer that
    // vitest fake timers cannot intercept, so the timeout tests below would
    // never actually fire the abort under `vi.useFakeTimers()`. This shim
    // routes the timeout through `setTimeout` so fake timers can drive it
    // deterministically via `vi.advanceTimersByTimeAsync`. It mirrors the
    // production iOS-15 fallback in `createSignOutTimeoutSignal` and is safe
    // to remove when vitest fake timers gain native-libuv coverage, or when
    // `signOut` stops using `AbortSignal.timeout`.
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(new DOMException('The operation timed out', 'TimeoutError')), ms)
      return controller.signal
    })
  })

  afterEach(() => {
    // Drop any abort-timer callbacks the AbortSignal.timeout spy scheduled on
    // real timers before the next test starts, so they cannot fire later and
    // surface as unhandled abort errors detached from their owning test.
    vi.clearAllTimers()
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
    // Attach a no-op rejection handler up front so that when the abort timer
    // fires inside `advanceTimersByTimeAsync` and signOut's awaited fetch
    // rejects, vitest's microtask drain does not briefly see the parent
    // promise as unhandled before `expect(promise).rejects` attaches its own
    // handler further down. The explicit rejection assertion below still
    // verifies the error shape.
    promise.catch(() => {})

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://api.airi.test/api/auth/oauth2/end-session?id_token_hint=id-token&client_id=client-id')
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('GET')
    expect(mocks.authStore.clearAllAuthState).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(SIGN_OUT_REQUEST_TIMEOUT_MS - 1)
    expect(mocks.authStore.clearAllAuthState).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    await expect(promise).rejects.toThrow('sign-out timed out')
    expect(mocks.authStore.clearAllAuthState).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
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
    // See OIDC test above for why we attach a no-op rejection handler up front.
    promise.catch(() => {})

    await vi.advanceTimersByTimeAsync(SIGN_OUT_REQUEST_TIMEOUT_MS)
    await expect(promise).rejects.toThrow('sign-out timed out')
    expect(mocks.authStore.clearAllAuthState).not.toHaveBeenCalled()
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
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

    // Type the fetch signature so `mock.calls` is inferred as
    // [RequestInfo | URL, RequestInit | undefined][] instead of an empty tuple,
    // which lets the assertions below read calls[0][1] without `as RequestInit`.
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => ({} as Response))
    vi.stubGlobal('fetch', fetchMock)

    await signOut()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('https://api.airi.test/api/auth/sign-out')
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer access-token' },
    })
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal)
    expect(mocks.authStore.clearAllAuthState).toHaveBeenCalledTimes(1)
  })

  // NOTICE: stage-pocket still targets iOS 15 (`IPHONEOS_DEPLOYMENT_TARGET = 15.0`),
  // whose WKWebView does not ship `AbortSignal.timeout`. This test exercises
  // the manual `AbortController` + `setTimeout` fallback in
  // `createSignOutTimeoutSignal` by hiding the native static for one call.
  it('falls back to a manual AbortController timer when AbortSignal.timeout is unavailable (iOS 15)', async () => {
    vi.useFakeTimers()
    const nativeTimeout = AbortSignal.timeout
    // @ts-expect-error -- intentionally hide the static to simulate iOS 15 WKWebView
    AbortSignal.timeout = undefined

    try {
      const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('sign-out timed out', 'AbortError'))
          })
        })
      })
      vi.stubGlobal('fetch', fetchMock)

      const promise = signOut()
      promise.catch(() => {})

      await vi.advanceTimersByTimeAsync(SIGN_OUT_REQUEST_TIMEOUT_MS - 1)
      expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(false)

      await vi.advanceTimersByTimeAsync(1)
      await expect(promise).rejects.toThrow('sign-out timed out')
      expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
      expect(mocks.authStore.clearAllAuthState).not.toHaveBeenCalled()
    }
    finally {
      AbortSignal.timeout = nativeTimeout
    }
  })
})

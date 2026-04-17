import type { Account } from 'better-auth'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'

// NOTICE:
// Mock the runtime dependencies of `libs/auth` so importing the module under
// test does not pull in better-auth, Pinia, server URLs, or the auth store
// (which transitively wants `useLocalStorage` + `window.matchMedia`). The
// integration tests below only care about the user-id watcher chain and the
// EffectScope lifecycle — they do NOT care about the actual auth client or
// storage internals.
//
// We can't run jsdom in this workspace (Node 20.18.2 + html-encoding-sniffer
// hits ERR_REQUIRE_ESM), so the test stubs every module that would otherwise
// touch the DOM. Stand in for `useAuthStore` with a plain Pinia-shaped
// `reactive({ user: null, ... })` object.
vi.mock('better-auth/vue', () => ({
  createAuthClient: vi.fn(() => ({
    signOut: vi.fn().mockResolvedValue(undefined),
    getSession: vi.fn().mockResolvedValue({ data: null }),
    listSessions: vi.fn(),
    signIn: { social: vi.fn() },
  })),
}))

vi.mock('./server', () => ({
  SERVER_URL: 'http://localhost:3000',
}))

vi.mock('./auth-oidc', () => ({
  buildAuthorizationURL: vi.fn(),
  persistFlowState: vi.fn(),
  refreshAccessToken: vi.fn(),
}))

// NOTICE:
// `bindAccountManagementResetToAuth` only reads `authStore.user?.id`, so a
// plain reactive shim is enough. We also stub `useAuthStore` so importing
// `libs/auth` does not pull the real Pinia store (which depends on
// `@vueuse/core`'s `useLocalStorage` + `window.matchMedia`).
const fakeAuthStore = reactive<{ user: { id: string } | null }>({ user: null })

vi.mock('../stores/auth', () => ({
  useAuthStore: () => fakeAuthStore,
}))

vi.mock('../composables/api', () => ({
  client: {
    api: { v1: { flux: { $get: vi.fn().mockResolvedValue({ ok: false }) } } },
  },
}))

const { bindAccountManagementResetToAuth } = await import('./auth')
const { sharedAccounts, sharedError, sharedLoading } = await import('../composables/use-account-management-state')

/**
 * Build a minimal Better-Auth `Account` for seeding the shared state.
 *
 * @example fakeAccount('google') // → { providerId: 'google', ... }
 */
function fakeAccount(providerId: string): Account {
  return {
    id: `acct-${providerId}`,
    providerId,
    accountId: `external-${providerId}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Account
}

describe('bindAccountManagementResetToAuth', () => {
  beforeEach(() => {
    fakeAuthStore.user = null
    sharedAccounts.value = []
    sharedLoading.value = false
    sharedError.value = null
  })

  it('Issue #1674: clears the shared account state when the active user signs out', async () => {
    // ROOT CAUSE:
    //
    // `signOut()` previously had to call `resetAccountManagementState()`
    // eagerly to wipe the shared refs. With the watcher in place the auth
    // store becomes the single source of truth: any path that nulls
    // `authStore.user` (signOut, session expiry, fetchSession on a revoked
    // token) drives the same reset.
    //
    // This test simulates the signOut tail by setting `user = null` directly
    // and asserts the watcher reacts.
    fakeAuthStore.user = { id: 'user-A' }
    bindAccountManagementResetToAuth(fakeAuthStore as never)

    sharedAccounts.value = [fakeAccount('google'), fakeAccount('github')]
    sharedLoading.value = true
    sharedError.value = 'previous-failure'

    fakeAuthStore.user = null
    await nextTick()

    expect(sharedAccounts.value).toEqual([])
    expect(sharedLoading.value).toBe(false)
    expect(sharedError.value).toBeNull()
  })

  it('Issue #1674: clears the shared account state when the user id switches without signing out (OIDC bridge)', async () => {
    // The OIDC identity-bridge path swaps `authStore.user` from one
    // populated user to another without `isAuthenticated` ever flipping
    // back to false, so `onLogout`-style hooks miss the transition. The
    // user-id watcher catches it because the `id` source value changes.
    fakeAuthStore.user = { id: 'user-A' }
    bindAccountManagementResetToAuth(fakeAuthStore as never)

    sharedAccounts.value = [fakeAccount('credential'), fakeAccount('google')]

    fakeAuthStore.user = { id: 'user-B' }
    await nextTick()

    expect(sharedAccounts.value).toEqual([])
  })

  it('does not corrupt initial sign-in transition (no stale state to wipe)', async () => {
    // When a fresh page-load completes sign-in, `user` goes from `null` to
    // populated. The watcher fires, but `resetAccountManagementState()` on
    // an already-empty state is a no-op; this test pins that contract so
    // future refactors do not start auto-loading providers from the
    // watcher and racing the initial signed-in render.
    fakeAuthStore.user = null
    bindAccountManagementResetToAuth(fakeAuthStore as never)

    fakeAuthStore.user = { id: 'user-A' }
    await nextTick()

    expect(sharedAccounts.value).toEqual([])
    expect(sharedLoading.value).toBe(false)
    expect(sharedError.value).toBeNull()
  })

  it('Issue #1674: survives unmount of the component that originally registered the watcher', async () => {
    // ROOT CAUSE:
    //
    // The previous implementation registered the user-id watcher inside
    // `initializeAuth()`, which is called from a Vue `setup` context
    // (typically `useAuthProviderSync()`). Vue would tie the `watch` to
    // the calling component's EffectScope, so the moment that component
    // unmounted (route change, layout swap, HMR) the watcher stopped
    // firing — and a subsequent sign-out left stale account data behind.
    //
    // The fix wraps the watcher in a module-level detached EffectScope.
    // We verify the contract by registering inside an `effectScope()` we
    // immediately stop, then triggering a user change.
    fakeAuthStore.user = { id: 'user-A' }

    const callerScope = effectScope()
    callerScope.run(() => {
      bindAccountManagementResetToAuth(fakeAuthStore as never)
    })
    callerScope.stop()

    sharedAccounts.value = [fakeAccount('google')]
    fakeAuthStore.user = null
    await nextTick()

    expect(sharedAccounts.value).toEqual([])
  })
})

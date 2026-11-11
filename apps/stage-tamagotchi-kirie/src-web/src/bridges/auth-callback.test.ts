// @vitest-environment jsdom

import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { createPinia, disposePinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  airiAuthCallback,
  airiAuthCallbackError,
} from '../shared/eventa'
import { initializeAuthCallbackBridge } from './auth-callback'

const eventHandlers = vi.hoisted(() => new Map<object, (event: { body?: unknown }) => Promise<void> | void>())
const requestAuthSession = vi.hoisted(() => vi.fn())

vi.mock('@proj-airi/stage-host-context', () => ({
  getHostEventaContext: () => ({
    on: (event: object, handler: (event: { body?: unknown }) => Promise<void> | void) => {
      eventHandlers.set(event, handler)
    },
  }),
}))

// The auth server is the external boundary. The store itself stays real.
vi.mock('@proj-airi/stage-ui/libs/auth-client', async importOriginal => ({
  ...await importOriginal<typeof import('@proj-airi/stage-ui/libs/auth-client')>(),
  requestAuthSession,
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

describe('auth callback bridge', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    localStorage.clear()
    eventHandlers.clear()
    pinia = createPinia()
    setActivePinia(pinia)
    requestAuthSession.mockReset()
    requestAuthSession.mockResolvedValue({
      user: { id: 'user', name: 'User', email: 'user@example.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() },
      session: { id: 'session', userId: 'user', token: 'session', expiresAt: new Date(Date.now() + 3_600_000), createdAt: new Date(), updatedAt: new Date() },
    })
    // Authentication starts a credit request. Keep it away from the network.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ flux: 0 }))
  })

  afterEach(() => {
    disposePinia(pinia)
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('routes exchanged OIDC tokens through the auth store action', async () => {
    // ROOT CAUSE:
    //
    // The callback wrote VueUse storage refs and queried the session at once.
    // VueUse persisted the access token in the next microtask, so the session
    // request could read the previous token and clear the complete auth state.
    initializeAuthCallbackBridge()

    const handler = eventHandlers.get(airiAuthCallback)
    expect(handler).toBeTypeOf('function')

    await handler?.({
      body: {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        idToken: 'new-id-token',
        expiresIn: 3600,
      },
    })

    const auth = useAuthStore()
    expect(requestAuthSession).toHaveBeenCalledWith('new-access-token')
    expect(auth.token).toBe('new-access-token')
    expect(auth.refreshToken).toBe('new-refresh-token')
    expect(auth.idToken).toBe('new-id-token')
    expect(auth.oidcClientId).toBe('airi-stage-electron')
    expect(auth.isAuthenticated).toBe(true)
    expect(eventHandlers.has(airiAuthCallbackError)).toBe(true)
  })
})

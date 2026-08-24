import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  electronAuthCallback,
  electronAuthCallbackError,
} from '../../shared/eventa'
import { initializeElectronAuthCallbackBridge } from './electron-auth-callback'

const authMocks = vi.hoisted(() => ({
  completeSignIn: vi.fn(),
}))

const eventHandlers = vi.hoisted(() => new Map<object, (event: { body?: unknown }) => Promise<void> | void>())

vi.mock('@proj-airi/electron-vueuse', () => ({
  getElectronEventaContext: () => ({
    on: (event: object, handler: (event: { body?: unknown }) => Promise<void> | void) => {
      eventHandlers.set(event, handler)
    },
  }),
}))

vi.mock('@proj-airi/stage-ui/stores/auth', () => ({
  useAuthStore: () => ({
    completeSignIn: authMocks.completeSignIn,
  }),
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

describe('electron auth callback bridge', () => {
  beforeEach(() => {
    eventHandlers.clear()
    authMocks.completeSignIn.mockReset()
    authMocks.completeSignIn.mockResolvedValue(true)
  })

  it('routes exchanged OIDC tokens through the auth store action', async () => {
    // ROOT CAUSE:
    //
    // The callback wrote VueUse storage refs and queried the session at once.
    // VueUse persisted the access token in the next microtask, so the session
    // request could read the previous token and clear the complete auth state.
    initializeElectronAuthCallbackBridge()

    const handler = eventHandlers.get(electronAuthCallback)
    expect(handler).toBeTypeOf('function')

    await handler?.({
      body: {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        idToken: 'new-id-token',
        expiresIn: 3600,
      },
    })

    expect(authMocks.completeSignIn).toHaveBeenCalledWith({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      idToken: 'new-id-token',
      expiresIn: 3600,
      clientId: 'airi-stage-electron',
    })
    expect(eventHandlers.has(electronAuthCallbackError)).toBe(true)
  })
})

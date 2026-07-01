import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { electronAuthCallback, electronAuthCallbackError, electronAuthSteamProbe } from '../../shared/eventa'
import { initializeElectronAuthCallbackBridge } from './electron-auth-callback'

// NOTICE:
// Why: `handlers` is shared between the test body and the `vi.mock` factory for
//   `@proj-airi/electron-vueuse`. `vi.mock` is hoisted above top-level `const`
//   declarations, so a plain module-scoped `const handlers` would hit a TDZ
//   error when the factory runs during import resolution.
// Root cause: vitest hoists `vi.mock` calls to the top of the file, above other
//   top-level statements.
// Source/context: https://vitest.dev/guide/mocking.html#mocking-priorities
// Removal condition: only if this test is deleted.
const { handlers } = vi.hoisted(() => ({
  handlers: new Map<unknown, (event: { body?: unknown }) => void | Promise<void>>(),
}))

// Mock the Electron eventa context so the bridge registers handlers against a
// controllable fake. Mocking @proj-airi/electron-vueuse is endorsed by AGENTS.md
// ("Mock IPC/services with vi.fn/vi.mock; do not rely on real Electron runtime").
vi.mock('@proj-airi/electron-vueuse', () => ({
  getElectronEventaContext: () => ({
    on: vi.fn((eventDef: unknown, handler: (event: { body?: unknown }) => void | Promise<void>) => {
      handlers.set(eventDef, handler)
    }),
    emit: vi.fn(),
  }),
}))

vi.mock('@proj-airi/stage-ui/libs/auth', () => ({
  fetchSession: vi.fn(async () => {}),
  triggerSignIn: vi.fn(),
}))

vi.mock('vue-sonner', () => ({
  toast: { error: vi.fn() },
}))

async function emit(eventDef: unknown, body: unknown): Promise<void> {
  await handlers.get(eventDef)?.({ body })
}

describe('initializeElectronAuthCallbackBridge — steamStatus', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    handlers.clear()
    vi.clearAllMocks()
    initializeElectronAuthCallbackBridge()
  })

  it('sets steamStatus to checking on a checking probe event', async () => {
    const authStore = useAuthStore()
    await emit(electronAuthSteamProbe, { status: 'checking' })
    expect(authStore.steamStatus).toBe('checking')
  })

  it('sets steamStatus to pending on a pending probe event', async () => {
    const authStore = useAuthStore()
    await emit(electronAuthSteamProbe, { status: 'pending' })
    expect(authStore.steamStatus).toBe('pending')
  })

  it('ignores a probe event with an unknown status', async () => {
    const authStore = useAuthStore()
    authStore.steamStatus = 'pending'
    await emit(electronAuthSteamProbe, { status: 'bogus' })
    expect(authStore.steamStatus).toBe('pending')
  })

  it('resets steamStatus to idle on auth callback', async () => {
    const authStore = useAuthStore()
    authStore.steamStatus = 'pending'
    await emit(electronAuthCallback, { accessToken: 'a', expiresIn: 3600 })
    expect(authStore.steamStatus).toBe('idle')
  })

  it('resets steamStatus to idle on auth callback error', async () => {
    const authStore = useAuthStore()
    authStore.steamStatus = 'pending'
    await emit(electronAuthCallbackError, { error: 'boom' })
    expect(authStore.steamStatus).toBe('idle')
  })
})

import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { electronAuthCallback, electronAuthCallbackError } from '../../shared/eventa'
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

// NOTICE:
// Why: `fetchSessionMock` / `toastErrorMock` are shared between the test body
//   and the `vi.mock` factories for `@proj-airi/stage-ui/libs/auth` and
//   `vue-sonner`, for the same hoisting reason as `handlers` above.
// Removal condition: only if these assertions are removed.
const { fetchSessionMock, toastErrorMock } = vi.hoisted(() => ({
  fetchSessionMock: vi.fn(async () => {}),
  toastErrorMock: vi.fn(),
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
  fetchSession: fetchSessionMock,
  triggerSignIn: vi.fn(),
}))

vi.mock('vue-sonner', () => ({
  toast: { error: toastErrorMock },
}))

async function emit(eventDef: unknown, body: unknown): Promise<void> {
  await handlers.get(eventDef)?.({ body })
}

describe('initializeElectronAuthCallbackBridge', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    handlers.clear()
    fetchSessionMock.mockClear()
    toastErrorMock.mockClear()
    initializeElectronAuthCallbackBridge()
  })

  it('applies tokens and fetches the session on auth callback', async () => {
    const authStore = useAuthStore()
    await emit(electronAuthCallback, { accessToken: 'a', expiresIn: 3600 })
    expect(authStore.token).toBe('a')
    expect(fetchSessionMock).toHaveBeenCalledTimes(1)
  })

  it('toasts the error message on auth callback error', async () => {
    await emit(electronAuthCallbackError, { error: 'boom' })
    expect(toastErrorMock).toHaveBeenCalledWith('boom')
  })
})

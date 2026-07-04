import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useStageWindowLifecycleStore } from './stage-window-lifecycle'

/**
 * Verifies the lifecycle store re-registers its eventa listener when the
 * underlying eventa context is swapped (e.g. via
 * `resetElectronEventaContextForTesting()`).
 *
 * Regression guard for PR #66 finding #6: previously the store used a bare
 * `let initialized = false` boolean which stayed `true` after a context
 * reset, so the new context never received a listener and the store went
 * silent. The fix tracks the context instance itself.
 *
 * Mocks `@proj-airi/tauri-vueuse` to return whichever fake context we
 * have staged inside `currentContextRef`, so the store's
 * `lastContext === context` comparison is observable between resets.
 */
const { getCurrentContextMock, useElectronEventaInvokeMock, currentContextRef } = vi.hoisted(() => {
  const currentContextRef = { ctx: null as any }
  const getCurrentContextMock = vi.fn(() => currentContextRef.ctx)
  const useElectronEventaInvokeMock = vi.fn(() => async () => ({
    focused: true,
    minimized: false,
    reason: 'snapshot',
    updatedAt: 1,
    visible: true,
  }))
  return { getCurrentContextMock, useElectronEventaInvokeMock, currentContextRef }
})

vi.mock('@proj-airi/tauri-vueuse', () => ({
  getElectronEventaContext: getCurrentContextMock,
  useElectronEventaInvoke: useElectronEventaInvokeMock,
}))

// The lifecycle contracts are only used as opaque tokens passed through to
// context.on / useElectronEventaInvoke — stub the module so the store does
// not pull in the real (Tauri-bound) definitions under vitest's node env.
vi.mock('@proj-airi/tauri-eventa', () => ({
  electronGetWindowLifecycleState: { id: 'eventa:invoke:electron:window:get-lifecycle-state', type: 'event' },
  electronWindowLifecycleChanged: { id: 'eventa:event:electron:window:lifecycle-changed', type: 'event' },
}))

function makeFakeContext() {
  const on = vi.fn()
  return { on }
}

beforeEach(() => {
  setActivePinia(createPinia())
  getCurrentContextMock.mockClear()
  useElectronEventaInvokeMock.mockClear()
})

describe('useStageWindowLifecycleStore — context reset', () => {
  it('registers a listener on the initial context', async () => {
    const ctxA = makeFakeContext()
    // eslint-disable-next-line ts/no-unsafe-assignment
    currentContextRef.ctx = ctxA
    getCurrentContextMock.mockImplementation(() => ctxA)

    const store = useStageWindowLifecycleStore()
    await store.initializeWindowLifecycleBridge()

    expect(ctxA.on).toHaveBeenCalledOnce()
    expect(useElectronEventaInvokeMock).toHaveBeenCalledOnce()
  })

  it('does not re-register on the same context instance', async () => {
    const ctxA = makeFakeContext()
    getCurrentContextMock.mockImplementation(() => ctxA)

    const store = useStageWindowLifecycleStore()
    await store.initializeWindowLifecycleBridge()
    await store.initializeWindowLifecycleBridge()

    expect(ctxA.on).toHaveBeenCalledOnce()
    expect(useElectronEventaInvokeMock).toHaveBeenCalledOnce()
  })

  it('registers a NEW listener on a NEW context after a reset', async () => {
    // Stage the first context (simulating the production single-context world).
    const ctxA = makeFakeContext()
    getCurrentContextMock.mockImplementation(() => ctxA)

    const store = useStageWindowLifecycleStore()
    await store.initializeWindowLifecycleBridge()
    expect(ctxA.on).toHaveBeenCalledOnce()

    // Simulate resetElectronEventaContextForTesting(): a brand-new context
    // instance is now served by getElectronEventaContext(). The bug would
    // bail out on the stale boolean flag; the fix must re-register.
    const ctxB = makeFakeContext()
    getCurrentContextMock.mockImplementation(() => ctxB)

    await store.initializeWindowLifecycleBridge()

    // ctxB received a fresh listener registration.
    expect(ctxB.on).toHaveBeenCalledOnce()
    // The total invoke-call count is 2 (initial fetch on ctxA + ctxB).
    expect(useElectronEventaInvokeMock).toHaveBeenCalledTimes(2)
  })

  it('surfaces events through the freshly registered listener after a reset', async () => {
    const ctxA = makeFakeContext()
    getCurrentContextMock.mockImplementation(() => ctxA)

    const store = useStageWindowLifecycleStore()
    await store.initializeWindowLifecycleBridge()

    // Capture the listener registered on ctxA.
    const listenerA = ctxA.on.mock.calls[0][1] as (event: any) => void

    listenerA({ body: { focused: false, minimized: true, reason: 'user', updatedAt: 2, visible: false } })
    expect(store.windowLifecycle).toMatchObject({ minimized: true, focused: false })

    // Now swap to a new context (post-reset) and ensure events still update.
    const ctxB = makeFakeContext()
    getCurrentContextMock.mockImplementation(() => ctxB)

    await store.initializeWindowLifecycleBridge()
    const listenerB = ctxB.on.mock.calls[0][1] as (event: any) => void

    listenerB({ body: { focused: true, minimized: false, reason: 'restore', updatedAt: 3, visible: true } })
    expect(store.windowLifecycle).toMatchObject({ minimized: false, focused: true, updatedAt: 3 })
  })
})

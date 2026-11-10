import type { HostWindowState } from '@gd-kirie/platform'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useHostWindowLifecycle } from './window-lifecycle'

const platform = vi.hoisted(() => ({
  getState: vi.fn(),
}))
const listeners = vi.hoisted(() => new Map<string, (event: { body?: HostWindowState }) => void>())

vi.mock('./owner', () => ({
  initializeHostContext: () => ({
    context: {
      on: (event: { id: string }, listener: (event: { body?: HostWindowState }) => void) => {
        listeners.set(event.id, listener)
        return () => listeners.delete(event.id)
      },
    },
    platform: { hostWindow: platform },
  }),
}))

describe('kirie host window lifecycle', () => {
  beforeEach(() => {
    platform.getState.mockReset()
    listeners.clear()
  })

  it('gets a native snapshot with AIRI lifecycle metadata', async () => {
    const state = { focused: true, minimized: false, visible: true }
    platform.getState.mockResolvedValue(state)

    await expect(useHostWindowLifecycle().getState()).resolves.toMatchObject({
      ...state,
      reason: 'snapshot',
    })
  })

  it('propagates a native snapshot error', async () => {
    const error = new Error('Host window state is unavailable.')
    platform.getState.mockRejectedValue(error)

    await expect(useHostWindowLifecycle().getState()).rejects.toBe(error)
  })

  it('labels native state transitions for the AIRI store', async () => {
    platform.getState.mockResolvedValue({ focused: true, minimized: false, visible: true })
    const lifecycle = useHostWindowLifecycle()
    const listener = vi.fn()
    lifecycle.onChanged(listener)
    await lifecycle.getState()

    const emitState = listeners.get('kirie:platform:host-window:state-changed')
    emitState?.({ body: { focused: false, minimized: true, visible: true } })
    emitState?.({ body: { focused: true, minimized: false, visible: true } })

    expect(listener).toHaveBeenNthCalledWith(1, expect.objectContaining({ reason: 'minimize' }))
    expect(listener).toHaveBeenNthCalledWith(2, expect.objectContaining({ reason: 'restore' }))
  })
})

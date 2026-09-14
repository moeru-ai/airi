import type { HostWindowState } from '@gd-kirie/platform'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useHostWindowLifecycle } from './window-lifecycle'

const platform = vi.hoisted(() => ({
  getState: vi.fn(),
  onStateChanged: vi.fn(),
}))

vi.mock('./owner', () => ({
  initializeHostContext: () => ({
    context: {},
    platform: { hostWindow: platform },
    runtime: 'kirie',
  }),
}))

describe('kirie host window lifecycle', () => {
  beforeEach(() => {
    platform.getState.mockReset()
    platform.onStateChanged.mockReset()
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
    let emitState: ((state: HostWindowState) => void) | undefined
    platform.getState.mockResolvedValue({ focused: true, minimized: false, visible: true })
    platform.onStateChanged.mockImplementation((listener: (state: HostWindowState) => void) => {
      emitState = listener
      return vi.fn()
    })
    const lifecycle = useHostWindowLifecycle()
    const listener = vi.fn()
    lifecycle.onChanged(listener)
    await lifecycle.getState()

    emitState?.({ focused: false, minimized: true, visible: true })
    emitState?.({ focused: true, minimized: false, visible: true })

    expect(listener).toHaveBeenNthCalledWith(1, expect.objectContaining({ reason: 'minimize' }))
    expect(listener).toHaveBeenNthCalledWith(2, expect.objectContaining({ reason: 'restore' }))
  })
})

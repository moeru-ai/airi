import type { BrowserWindow } from 'electron'

import { describe, expect, it, vi } from 'vitest'

import { createReusableWindow } from './reusable'

function createWindowDouble() {
  return {
    close: vi.fn(),
    isDestroyed: () => false,
    on: vi.fn(),
    webContents: { isDestroyed: () => false, isCrashed: () => false },
  }
}

describe('createReusableWindow', () => {
  it('closes a window whose creation a close overtook, instead of handing it out', async () => {
    const created = createWindowDouble()
    let finishSetup: (() => void) | undefined
    const reusable = createReusableWindow(() => new Promise<BrowserWindow>((resolve) => {
      finishSetup = () => resolve(created as unknown as BrowserWindow)
    }))

    const opening = reusable.getWindow()
    reusable.close()
    finishSetup?.()

    await expect(opening).rejects.toThrow('Window closed during creation')
    expect(created.close).toHaveBeenCalled()
    expect(reusable.getOpenWindow()).toBeUndefined()
  })

  it('creates a new window after a close', async () => {
    const first = createWindowDouble()
    const second = createWindowDouble()
    const setup = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
    const reusable = createReusableWindow(setup)

    await reusable.getWindow()
    reusable.close()
    // A real window reports `closed`; the double only records the listener.
    const onClosed = first.on.mock.calls.find(([event]) => event === 'closed')?.[1] as () => void
    onClosed()

    await expect(reusable.getWindow()).resolves.toBe(second)
    expect(first.close).toHaveBeenCalled()
  })
})

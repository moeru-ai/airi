import { BrowserWindow } from 'electron'
import { describe, expect, it, vi } from 'vitest'

import { createReusableWindow } from './reusable'

// NOTICE:
// A test double for the real `BrowserWindow`, which needs the Electron binary.
// It has only what `createReusableWindow` calls on the window it creates.
// Removal condition: unit tests running inside an Electron-based test runner.
vi.mock('electron', () => ({
  BrowserWindow: class {
    readonly close = vi.fn()
    readonly isDestroyed = vi.fn(() => false)
    readonly on = vi.fn()
    readonly webContents = { isDestroyed: () => false, isCrashed: () => false }
  },
}))

/** A reusable window whose setup finishes only when the test says so. */
function createDeferredReusableWindow() {
  const created: BrowserWindow[] = []
  let finishSetup: (() => void) | undefined
  const reusable = createReusableWindow(() => new Promise<BrowserWindow>((resolve) => {
    finishSetup = () => {
      const window = new BrowserWindow()
      created.push(window)
      resolve(window)
    }
  }))
  return { reusable, created, finishSetup: () => finishSetup?.() }
}

describe('createReusableWindow', () => {
  it('closes a window whose creation a close overtook, and creates a new one on the next open', async () => {
    const { reusable, created, finishSetup } = createDeferredReusableWindow()

    const opening = reusable.getWindow()
    reusable.close()
    finishSetup()

    await expect(opening).rejects.toThrow('Window closed during creation')
    expect(created[0].close).toHaveBeenCalled()
    expect(reusable.getOpenWindow()).toBeUndefined()

    // The discarded creation must not stay cached, or the window could never
    // open again until the app restarts.
    const reopening = reusable.getWindow()
    finishSetup()
    await expect(reopening).resolves.toBe(created[1])
  })

  it('closes the open window, then creates a new one instead of handing out the destroyed one', async () => {
    const { reusable, created, finishSetup } = createDeferredReusableWindow()
    const opening = reusable.getWindow()
    finishSetup()
    await opening

    reusable.close()
    expect(created[0].close).toHaveBeenCalled()

    vi.mocked(created[0].isDestroyed).mockReturnValue(true)
    expect(reusable.getOpenWindow()).toBeUndefined()

    const reopening = reusable.getWindow()
    finishSetup()
    await expect(reopening).resolves.toBe(created[1])
  })
})

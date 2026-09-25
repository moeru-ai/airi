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

describe('createReusableWindow', () => {
  it('closes a window whose creation a close overtook, instead of handing it out', async () => {
    const created = new BrowserWindow()
    let finishSetup: (() => void) | undefined
    const reusable = createReusableWindow(() => new Promise<BrowserWindow>((resolve) => {
      finishSetup = () => resolve(created)
    }))

    const opening = reusable.getWindow()
    reusable.close()
    finishSetup?.()

    await expect(opening).rejects.toThrow('Window closed during creation')
    expect(created.close).toHaveBeenCalled()
    expect(reusable.getOpenWindow()).toBeUndefined()
  })
})

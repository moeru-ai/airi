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
})

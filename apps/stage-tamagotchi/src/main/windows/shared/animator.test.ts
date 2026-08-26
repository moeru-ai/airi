import type { BrowserWindow, Rectangle } from 'electron'

import { describe, expect, it, vi } from 'vitest'

import { Animator } from './animator'

function createWindow(initialBounds: Rectangle) {
  const bounds = { ...initialBounds }

  return {
    getBounds: vi.fn(() => ({ ...bounds })),
    isDestroyed: vi.fn(() => false),
    setPosition: vi.fn((x: number, y: number) => {
      bounds.x = x
      bounds.y = y
    }),
    setSize: vi.fn((width: number, height: number) => {
      bounds.width = width
      bounds.height = height
    }),
  } satisfies Pick<BrowserWindow, 'getBounds' | 'isDestroyed' | 'setPosition' | 'setSize'>
}

function waitForAnimation(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 30))
}

describe('window bounds animator', () => {
  it('animates position after it applies the target size', async () => {
    const window = createWindow({ height: 400, width: 300, x: 10, y: 20 })
    const animator = new Animator(window)

    animator.windowBoundsAnimateTo(
      { height: 600, width: 450, x: 100, y: 200 },
      { duration: 1 },
    )
    await waitForAnimation()

    expect(window.setSize).toHaveBeenCalledWith(450, 600)
    expect(window.setPosition).toHaveBeenLastCalledWith(100, 200)
  })

  it('stops the previous animation before it starts a new animation', async () => {
    const window = createWindow({ height: 400, width: 300, x: 10, y: 20 })
    const animator = new Animator(window)

    animator.windowBoundsAnimateTo(
      { height: 400, width: 300, x: 100, y: 100 },
      { duration: 100 },
    )
    animator.windowBoundsAnimateTo(
      { height: 400, width: 300, x: 200, y: 200 },
      { duration: 1 },
    )
    await waitForAnimation()

    expect(window.setPosition).toHaveBeenLastCalledWith(200, 200)
  })

  it('does not start an animation for a destroyed window', () => {
    const window = createWindow({ height: 400, width: 300, x: 10, y: 20 })
    window.isDestroyed.mockReturnValue(true)
    const animator = new Animator(window)

    animator.windowBoundsAnimateTo({ height: 400, width: 300, x: 100, y: 200 })

    expect(window.setPosition).not.toHaveBeenCalled()
    expect(window.setSize).not.toHaveBeenCalled()
  })
})

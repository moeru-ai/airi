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
    const window = createWindow({ x: 10, y: 20, width: 300, height: 400 })
    const animator = new Animator(window)

    animator.windowBoundsAnimateTo(
      { x: 100, y: 200, width: 450, height: 600 },
      { duration: 1 },
    )
    await waitForAnimation()

    expect(window.setSize).toHaveBeenCalledWith(450, 600)
    expect(window.setPosition).toHaveBeenLastCalledWith(100, 200)
  })

  it('stops the previous animation before it starts a new animation', async () => {
    const window = createWindow({ x: 10, y: 20, width: 300, height: 400 })
    const animator = new Animator(window)

    animator.windowBoundsAnimateTo(
      { x: 100, y: 100, width: 300, height: 400 },
      { duration: 100 },
    )
    animator.windowBoundsAnimateTo(
      { x: 200, y: 200, width: 300, height: 400 },
      { duration: 1 },
    )
    await waitForAnimation()

    expect(window.setPosition).toHaveBeenLastCalledWith(200, 200)
  })

  it('does not start an animation for a destroyed window', () => {
    const window = createWindow({ x: 10, y: 20, width: 300, height: 400 })
    window.isDestroyed.mockReturnValue(true)
    const animator = new Animator(window)

    animator.windowBoundsAnimateTo({ x: 100, y: 200, width: 300, height: 400 })

    expect(window.setPosition).not.toHaveBeenCalled()
    expect(window.setSize).not.toHaveBeenCalled()
  })
})

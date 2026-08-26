import type { BrowserWindow, Rectangle } from 'electron'

import { animate, utils } from 'animejs'

type AnimatableWindow = Pick<BrowserWindow, 'getBounds' | 'isDestroyed' | 'setPosition' | 'setSize'>

/** Options for one window bounds animation. */
export interface WindowBoundsAnimationOptions {
  /** Animation duration in milliseconds. @default 350 */
  duration?: number
}

/**
 * Owns the active position animation for one Electron window.
 *
 * A new animation stops the previous animation. The class applies the target
 * size before movement. It does not animate window resizing.
 */
export class Animator {
  private animation?: ReturnType<typeof animate>

  constructor(private readonly window: AnimatableWindow) {}

  /** Animates the window position to the target bounds. */
  windowBoundsAnimateTo(target: Rectangle, options: WindowBoundsAnimationOptions = {}): void {
    this.stop()

    if (this.window.isDestroyed())
      return

    const current = this.window.getBounds()

    if (current.width !== target.width || current.height !== target.height)
      this.window.setSize(target.width, target.height)

    const state = { x: current.x, y: current.y }
    this.animation = animate(state, {
      x: target.x,
      y: target.y,
      duration: options.duration ?? 350,
      ease: 'outCubic',
      modifier: utils.round(0),
      onRender: () => {
        if (!this.window.isDestroyed())
          this.window.setPosition(Math.round(state.x), Math.round(state.y))
      },
    })
  }

  /** Stops the active animation. */
  stop(): void {
    this.animation?.pause()
    this.animation = undefined
  }
}

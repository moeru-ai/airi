export interface PresenceBubblePlacement {
  x: number
  y: number
}

/**
 * Longest span one integration step may cover, in milliseconds.
 *
 * A step much larger than the spring's period overshoots instead of converging,
 * so a slow frame is integrated as several small steps rather than one large one.
 */
const maxStepMs = 1000 / 120

/**
 * Longest span a single update may integrate at all, in milliseconds.
 *
 * A backgrounded window or a stalled frame can report a gap of seconds. The
 * spring converges over such a gap rather than overshooting, but it costs one
 * step per 8ms to get there, so the gap is treated as a pause: the bubble
 * resumes from where it was and closes the distance over the frames that follow.
 */
const maxCatchUpMs = 100

/** Pull toward the head. Higher closes the gap sooner. */
const stiffness = 170

/** Resistance to travel. Higher settles with less overshoot. */
const damping = 20

/**
 * Trails a moving head the way a held object trails the hand.
 *
 * The spring gives the bubble weight, so it lags into a turn and overshoots
 * slightly before settling. Time drives it, not frames: the stage renders at
 * whatever `settings/live2d/max-fps` allows, and the bubble must feel the same
 * at either rate.
 */
export class PresenceBubbleFollower {
  private x = 0
  private y = 0
  private velocityX = 0
  private velocityY = 0
  private settled = false

  /**
   * Places the bubble on a point with no travel and no velocity.
   *
   * Use when the bubble appears, when the model is replaced, and after a resize:
   * in each case the previous position describes a stage that no longer exists,
   * and springing away from it would read as the bubble flying in.
   */
  reset(x: number, y: number) {
    this.x = x
    this.y = y
    this.velocityX = 0
    this.velocityY = 0
    this.settled = true
  }

  /**
   * Forgets where the bubble was, so the next update seats it on its target.
   *
   * Use when the bubble is hidden, when the model is replaced, and when the
   * stage is rescaled: in each case the stored position describes a stage that
   * no longer exists, and springing from it would send the bubble across the
   * screen when it reappears.
   */
  release() {
    this.settled = false
  }

  /** Advances the spring and returns the position to draw this frame. */
  update(targetX: number, targetY: number, deltaMs: number): PresenceBubblePlacement {
    if (!this.settled) {
      this.reset(targetX, targetY)
      return { x: this.x, y: this.y }
    }

    let remainingMs = Math.min(Math.max(deltaMs, 0), maxCatchUpMs)
    while (remainingMs > 0) {
      const stepMs = Math.min(remainingMs, maxStepMs)
      const step = stepMs / 1000

      this.velocityX += ((targetX - this.x) * stiffness - this.velocityX * damping) * step
      this.velocityY += ((targetY - this.y) * stiffness - this.velocityY * damping) * step
      this.x += this.velocityX * step
      this.y += this.velocityY * step

      remainingMs -= stepMs
    }

    return { x: this.x, y: this.y }
  }
}

/**
 * Moves a value a fraction of the way to its target, framerate independent.
 *
 * Used to settle the measurements a decision reads, so a choice responds to a
 * real change such as a resize while ignoring the few pixels the head moves as
 * the character breathes. A spring would overshoot, which a threshold would then
 * read as a change worth acting on.
 *
 * @param current - Value settled so far.
 * @param target - Value being approached.
 * @param deltaMs - Time since the last call.
 * @param timeConstantMs - Time to close about 63% of the remaining distance.
 *
 * @example
 * smoothTowards(0, 10, 16, 180)
 * // => 0.85
 */
export function smoothTowards(current: number, target: number, deltaMs: number, timeConstantMs: number) {
  if (timeConstantMs <= 0 || deltaMs <= 0)
    return target

  return current + (target - current) * (1 - Math.exp(-deltaMs / timeConstantMs))
}

export interface PresenceBubbleFollowOptions {
  /** Pull toward the head. Higher closes the gap sooner. */
  stiffness?: number
  /** Resistance to travel. Higher settles with less overshoot. */
  damping?: number
  /**
   * How long one position is held before the next is committed, in
   * milliseconds. `0` follows every frame.
   */
  holdMs?: number
}

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
 * A backgrounded window, a breakpoint or a stalled frame can report a gap of
 * seconds. Simulating all of it would fling the bubble across the stage before
 * it settles, so the gap is treated as a pause and the bubble resumes from where
 * it was.
 */
const maxCatchUpMs = 100

const defaults = {
  stiffness: 170,
  damping: 20,
  // Follow every frame. Holding a position is what limited animation does to a
  // drawing, and the thinking dots are drawn that way, but a bubble that trails
  // the head is read as motion: quantizing it looks like dropped frames rather
  // than like an animation choice.
  holdMs: 0,
} as const satisfies Required<PresenceBubbleFollowOptions>

/**
 * Trails a moving head the way a held object trails the hand, and commits its
 * position in steps.
 *
 * Two behaviours are deliberately separate. The spring gives the bubble weight,
 * so it lags into a turn and overshoots slightly before settling. The hold
 * quantizes when that position is drawn, which reads as the stepped motion of
 * limited animation rather than a smooth slide.
 *
 * Time drives both, not frames: the stage renders at whatever
 * `settings/live2d/max-fps` allows, and the bubble must feel the same at either
 * rate.
 */
export class PresenceBubbleFollower {
  private readonly stiffness: number
  private readonly damping: number
  private readonly holdMs: number

  private x = 0
  private y = 0
  private velocityX = 0
  private velocityY = 0
  private heldX = 0
  private heldY = 0
  private holdElapsedMs = 0
  private settled = false

  constructor(options: PresenceBubbleFollowOptions = {}) {
    this.stiffness = options.stiffness ?? defaults.stiffness
    this.damping = options.damping ?? defaults.damping
    this.holdMs = Math.max(0, options.holdMs ?? defaults.holdMs)
  }

  /**
   * Places the bubble on a point with no travel and no velocity.
   *
   * Use when the bubble appears, when the model is replaced, and after a resize:
   * in each case the previous position describes a stage that no longer exists,
   * and springing away from it would read as the bubble flying in.
   */
  reset(x: number, y: number) {
    this.x = this.heldX = x
    this.y = this.heldY = y
    this.velocityX = 0
    this.velocityY = 0
    this.holdElapsedMs = 0
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
      return { x: this.heldX, y: this.heldY }
    }

    let remainingMs = Math.min(Math.max(deltaMs, 0), maxCatchUpMs)
    while (remainingMs > 0) {
      const stepMs = Math.min(remainingMs, maxStepMs)
      const step = stepMs / 1000

      this.velocityX += ((targetX - this.x) * this.stiffness - this.velocityX * this.damping) * step
      this.velocityY += ((targetY - this.y) * this.stiffness - this.velocityY * this.damping) * step
      this.x += this.velocityX * step
      this.y += this.velocityY * step

      remainingMs -= stepMs
    }

    if (this.holdMs === 0)
      return { x: this.x, y: this.y }

    this.holdElapsedMs += deltaMs
    if (this.holdElapsedMs >= this.holdMs) {
      // Drop whole holds rather than carrying the remainder, so a long frame
      // commits once instead of queueing catch-up commits behind it.
      this.holdElapsedMs %= this.holdMs
      this.heldX = this.x
      this.heldY = this.y
    }

    return { x: this.heldX, y: this.heldY }
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

import type { Pose } from '@proj-airi/model-driver-magic-live2d'

/** A point that the character looks at, in view space. */
export interface Live2DPoseAttentionTarget {
  /** Horizontal target from -1 (left) to 1 (right). */
  x: number
  /** Vertical target from -1 (down) to 1 (up). */
  y: number
}

/** How strongly an attention target turns a generated pose. */
export interface Live2DPoseAttentionOptions {
  /** Share of the target that the head turns to. The eyes turn the remaining share. @default 0.55 */
  headGain: number
  /** Share of the target that the body turns to. @default 0.15 */
  bodyGain: number
  /** Time constant of the fade in and the fade out, in seconds. @default 0.4 */
  fadeSeconds: number
  /** Time constant of the target smoothing, in seconds. @default 0.12 */
  followSeconds: number
}

/** Default gains for a cursor target on top of MAGIC motion. */
export const defaultLive2DPoseAttentionOptions: Live2DPoseAttentionOptions = Object.freeze({
  headGain: 0.55,
  bodyGain: 0.15,
  fadeSeconds: 0.4,
  followSeconds: 0.12,
})

/** The smoothed attention state after one step. */
export interface Live2DPoseAttentionState {
  x: number
  y: number
  /** Blend weight from 0 (no attention) to 1 (full attention). */
  weight: number
}

/** Smooths an attention target and applies it to generated poses. */
export interface Live2DPoseAttentionController {
  /** Advances the smoothing. An undefined target fades the attention out. */
  step: (target: Live2DPoseAttentionTarget | undefined, elapsedSeconds: number) => Live2DPoseAttentionState
  /** Adds the current attention to a pose. */
  apply: (pose: Pose) => Pose
  /** The current smoothed state. */
  state: () => Live2DPoseAttentionState
}

function clampAxis(value: number): number {
  return Math.min(1, Math.max(-1, value))
}

function smoothingFactor(elapsedSeconds: number, timeConstantSeconds: number): number {
  if (timeConstantSeconds <= 0)
    return 1
  return 1 - Math.exp(-Math.max(0, elapsedSeconds) / timeConstantSeconds)
}

/**
 * Adds an attention target on top of a generated pose.
 *
 * The head and the body turn a part of the way to the target. The eyes cover
 * the rest, measured from the turned head, so the gaze lands on the target
 * while the generated motion continues around it.
 */
export function applyLive2DPoseAttention(
  pose: Pose,
  attention: Live2DPoseAttentionState,
  options: Pick<Live2DPoseAttentionOptions, 'bodyGain' | 'headGain'> = defaultLive2DPoseAttentionOptions,
): Pose {
  const weight = Math.min(1, Math.max(0, attention.weight))
  if (weight === 0)
    return pose

  const headX = clampAxis(pose.headX + attention.x * options.headGain * weight)
  const headY = clampAxis(pose.headY + attention.y * options.headGain * weight)
  const gazeX = clampAxis(attention.x - headX)
  const gazeY = clampAxis(attention.y - headY)

  return {
    ...pose,
    headX,
    headY,
    bodyX: clampAxis(pose.bodyX + attention.x * options.bodyGain * weight),
    eyeX: pose.eyeX + (gazeX - pose.eyeX) * weight,
    eyeY: pose.eyeY + (gazeY - pose.eyeY) * weight,
  }
}

/**
 * Creates the attention layer of one Live2D model.
 *
 * The weight fades in while a target exists and fades out after it goes away.
 * The target point keeps its last value during the fade out, so the head turns
 * back to the generated motion instead of to the center first.
 */
export function createLive2DPoseAttention(
  options: Live2DPoseAttentionOptions = defaultLive2DPoseAttentionOptions,
): Live2DPoseAttentionController {
  const current: Live2DPoseAttentionState = { x: 0, y: 0, weight: 0 }

  function step(target: Live2DPoseAttentionTarget | undefined, elapsedSeconds: number): Live2DPoseAttentionState {
    const faded = current.weight === 0
    const fade = smoothingFactor(elapsedSeconds, options.fadeSeconds)
    current.weight += ((target ? 1 : 0) - current.weight) * fade
    if (current.weight < 0.001)
      current.weight = 0

    if (target) {
      const follow = faded ? 1 : smoothingFactor(elapsedSeconds, options.followSeconds)
      current.x += (clampAxis(target.x) - current.x) * follow
      current.y += (clampAxis(target.y) - current.y) * follow
    }

    return { ...current }
  }

  return {
    step,
    apply: pose => applyLive2DPoseAttention(pose, current, options),
    state: () => ({ ...current }),
  }
}

/**
 * Maps a point in the model canvas to an attention target.
 *
 * Unlike `Live2DModel.focus`, the result keeps its distance. A point near the
 * face turns the head a little, and a point far away turns it fully.
 *
 * @example
 * live2DAttentionTargetFromModelPoint({ x: 750, y: 250 }, { width: 1000, height: 1000 })
 * // => { x: 0.5, y: 0.5 }
 */
export function live2DAttentionTargetFromModelPoint(
  point: { x: number, y: number },
  size: { width: number, height: number },
): Live2DPoseAttentionTarget {
  const x = point.x / size.width * 2 - 1
  const y = 1 - point.y / size.height * 2
  const length = Math.hypot(x, y)
  if (length <= 1)
    return { x, y }
  return { x: x / length, y: y / length }
}

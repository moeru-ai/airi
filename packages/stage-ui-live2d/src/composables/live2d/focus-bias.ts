import type { Pose } from '@proj-airi/model-driver-magic-live2d'

/** A point that the character looks at, in view space. */
export interface Live2DFocusTarget {
  /** Horizontal target from -1 (left) to 1 (right). */
  x: number
  /** Vertical target from -1 (down) to 1 (up). */
  y: number
}

/** How strongly a focus target biases a generated pose. */
export interface Live2DFocusBiasOptions {
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
export const defaultLive2DFocusBiasOptions: Live2DFocusBiasOptions = Object.freeze({
  headGain: 0.55,
  bodyGain: 0.15,
  fadeSeconds: 0.4,
  followSeconds: 0.12,
})

/** The smoothed focus bias after one step. */
export interface Live2DFocusBiasState {
  x: number
  y: number
  /** Blend weight from 0 (no bias) to 1 (full bias). */
  weight: number
}

/** Smooths a focus target and biases generated poses toward it. */
export interface Live2DFocusBiasController {
  /** Advances the smoothing. An undefined target fades the bias out. */
  step: (target: Live2DFocusTarget | undefined, elapsedSeconds: number) => Live2DFocusBiasState
  /** Adds the current bias to a pose. */
  apply: (pose: Pose) => Pose
  /** The current smoothed state. */
  state: () => Live2DFocusBiasState
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
 * Biases a generated pose toward a focus target.
 *
 * The head and the body turn a part of the way to the target. The eyes cover
 * the rest, measured from the turned head, so the gaze lands on the target
 * while the generated motion continues around it.
 */
export function applyLive2DFocusBias(
  pose: Pose,
  bias: Live2DFocusBiasState,
  options: Pick<Live2DFocusBiasOptions, 'bodyGain' | 'headGain'> = defaultLive2DFocusBiasOptions,
): Pose {
  const weight = Math.min(1, Math.max(0, bias.weight))
  if (weight === 0)
    return pose

  const headX = clampAxis(pose.headX + bias.x * options.headGain * weight)
  const headY = clampAxis(pose.headY + bias.y * options.headGain * weight)
  const gazeX = clampAxis(bias.x - headX)
  const gazeY = clampAxis(bias.y - headY)

  return {
    ...pose,
    headX,
    headY,
    bodyX: clampAxis(pose.bodyX + bias.x * options.bodyGain * weight),
    eyeX: pose.eyeX + (gazeX - pose.eyeX) * weight,
    eyeY: pose.eyeY + (gazeY - pose.eyeY) * weight,
  }
}

/**
 * Creates the focus bias of one Live2D model.
 *
 * The weight fades in while a target exists and fades out after it goes away.
 * The target point keeps its last value during the fade out, so the head turns
 * back to the generated motion instead of to the center first.
 */
export function createLive2DFocusBias(
  options: Live2DFocusBiasOptions = defaultLive2DFocusBiasOptions,
): Live2DFocusBiasController {
  const current: Live2DFocusBiasState = { x: 0, y: 0, weight: 0 }

  function step(target: Live2DFocusTarget | undefined, elapsedSeconds: number): Live2DFocusBiasState {
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
    apply: pose => applyLive2DFocusBias(pose, current, options),
    state: () => ({ ...current }),
  }
}

/**
 * Maps a point in the model canvas to a focus target.
 *
 * Unlike `Live2DModel.focus`, the result keeps its distance. A point near the
 * face turns the head a little, and a point far away turns it fully.
 *
 * @example
 * live2DFocusTargetFromModelPoint({ x: 750, y: 250 }, { width: 1000, height: 1000 })
 * // => { x: 0.5, y: 0.5 }
 */
export function live2DFocusTargetFromModelPoint(
  point: { x: number, y: number },
  size: { width: number, height: number },
): Live2DFocusTarget {
  const x = point.x / size.width * 2 - 1
  const y = 1 - point.y / size.height * 2
  const length = Math.hypot(x, y)
  if (length <= 1)
    return { x, y }
  return { x: x / length, y: y / length }
}

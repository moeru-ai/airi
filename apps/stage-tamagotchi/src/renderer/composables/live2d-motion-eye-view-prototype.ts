import type { Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

/** A latched view-space target for the eye-fixation prototype. */
export interface Live2DEyeViewPrototypeState {
  enabled: boolean
  /** Horizontal view target from -1 (left) to 1 (right). */
  x: number
  /** Vertical view target from -1 (down) to 1 (up). */
  y: number
  /** Amount of head movement removed from the eye target. */
  counterStrength: number
}

export const defaultLive2DEyeViewPrototypeState: Live2DEyeViewPrototypeState = Object.freeze({
  enabled: true,
  x: 0,
  y: 0,
  counterStrength: 1,
})

function clampAxis(value: number): number {
  return Math.min(1, Math.max(-1, value))
}

/**
 * Applies a world-fixed eye target after a motion source produces its pose.
 *
 * Head movement is subtracted so the eyes keep their view direction while the
 * head moves beneath it. Other eye parameters, including squint, are preserved.
 */
export function applyLive2DEyeViewPrototype(
  pose: Live2DMotionControlPose,
  view: Live2DEyeViewPrototypeState,
): Live2DMotionControlPose {
  if (!view.enabled)
    return pose

  return {
    ...pose,
    eyeX: clampAxis(view.x - pose.headX * view.counterStrength),
    eyeY: clampAxis(view.y - pose.headY * view.counterStrength),
  }
}

import type { Pose } from '@proj-airi/model-driver-magic-live2d'

/** A fixed view-space target that controls eye direction after motion generation. */
export interface Live2DMotionViewTargetState {
  enabled: boolean
  /** Horizontal view target from -1 (left) to 1 (right). */
  x: number
  /** Vertical view target from -1 (down) to 1 (up). */
  y: number
  /** Amount of head movement removed from the eye target. */
  counterStrength: number
}

/** The forward-facing view target used by MAGIC and the motion devtools. */
export const defaultLive2DMotionViewTargetState: Live2DMotionViewTargetState = Object.freeze({
  enabled: true,
  x: 0,
  y: 0,
  counterStrength: 1,
})

/**
 * Applies a fixed eye target after a motion source produces its pose.
 *
 * Head movement is subtracted so the eyes keep their view direction while the
 * head moves beneath it. Other eye parameters, including squint, are preserved.
 */
export function applyLive2DMotionViewTarget(
  pose: Pose,
  target: Live2DMotionViewTargetState,
): Pose {
  if (!target.enabled)
    return pose

  return {
    ...pose,
    eyeX: Math.min(1, Math.max(-1, target.x - pose.headX * target.counterStrength)),
    eyeY: Math.min(1, Math.max(-1, target.y - pose.headY * target.counterStrength)),
  }
}

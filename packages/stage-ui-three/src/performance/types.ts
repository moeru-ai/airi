export type VrmUpperBodyBone
  = | 'hips'
    | 'spine'
    | 'chest'
    | 'upperChest'
    | 'neck'
    | 'head'
    | 'leftShoulder'
    | 'leftUpperArm'
    | 'leftLowerArm'
    | 'leftHand'
    | 'rightShoulder'
    | 'rightUpperArm'
    | 'rightLowerArm'
    | 'rightHand'

export interface GestureBoneRotation {
  rot: [number, number, number, number] // quaternion (x, y, z, w)
}

export interface GestureFrame {
  /**
   * Milliseconds relative to the enqueue start time.
   */
  t: number
  /**
   * Bone rotations for this frame.
   */
  bones: Partial<Record<VrmUpperBodyBone, GestureBoneRotation>>
  /**
   * Blend weight to apply when writing this frame, defaults to 1.
   */
  weight?: number
}

export interface EnqueueGestureFramesOptions {
  /**
   * Absolute time on the scene clock (ms). If omitted, uses "now" at enqueue time.
   */
  startAtMs?: number
}

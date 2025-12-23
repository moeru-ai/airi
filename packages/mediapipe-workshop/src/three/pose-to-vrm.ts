import type { PoseState, Vec3 } from '../types'

export interface PoseToVrmOptions {
  /**
   * Axis remap from MediaPipe world to three/VRM-ish space.
   * This is a pragmatic default; adjust if you see mirrored or inverted motion.
   */
  axis?: {
    x: 1 | -1
    y: 1 | -1
    z: 1 | -1
  }

  /**
   * Confidence gating based on MediaPipe pose landmark `visibility` / `presence`.
   * When a landmark is not confident (e.g. off-screen), we skip emitting targets that depend on it.
   */
  confidence?: {
    /**
     * Min `visibility` in [0..1]. Only enforced when the field exists on the landmark.
     */
    minVisibility?: number
    /**
     * Min `presence` in [0..1]. Only enforced when the field exists on the landmark.
     */
    minPresence?: number
  }

  /**
   * Use previous frame information to avoid sudden 180° flips caused by ambiguous poles.
   */
  stabilize?: {
    previousTargets?: VrmPoseTargets
    previousForward?: Vec3
  }
}

export type VrmPoseDirections = Partial<Record<
  | 'hips'
  | 'spine'
  | 'chest'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftUpperArm'
  | 'leftLowerArm'
  | 'rightUpperArm'
  | 'rightLowerArm'
  | 'leftUpperLeg'
  | 'leftLowerLeg'
  | 'rightUpperLeg'
  | 'rightLowerLeg',
  Vec3
>>

export interface VrmPoseTarget {
  dir: Vec3
  pole?: Vec3
}

export type VrmPoseTargets = Partial<Record<keyof VrmPoseDirections, VrmPoseTarget>>

const DEFAULT_AXIS = { x: 1 as const, y: 1 as const, z: 1 as const }
const DEFAULT_MIN_VISIBILITY = 0.5
const DEFAULT_MIN_PRESENCE = 0

function vSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) }
}

function vAdd(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: (a.z ?? 0) + (b.z ?? 0) }
}

function vScale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: (v.z ?? 0) * s }
}

function vLen(v: Vec3): number {
  return Math.hypot(v.x, v.y, v.z ?? 0)
}

function vNormalize(v: Vec3): Vec3 | null {
  const len = vLen(v)
  if (!Number.isFinite(len) || len <= 1e-6)
    return null
  return vScale(v, 1 / len)
}

function vRemapAxis(v: Vec3, axis: { x: 1 | -1, y: 1 | -1, z: 1 | -1 }): Vec3 {
  return { x: v.x * axis.x, y: v.y * axis.y, z: (v.z ?? 0) * axis.z }
}

function vCross(a: Vec3, b: Vec3): Vec3 {
  const az = a.z ?? 0
  const bz = b.z ?? 0
  return {
    x: a.y * bz - az * b.y,
    y: az * b.x - a.x * bz,
    z: a.x * b.y - a.y * b.x,
  }
}

function vDot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + (a.z ?? 0) * (b.z ?? 0)
}

function vNeg(v: Vec3): Vec3 {
  return { x: -v.x, y: -v.y, z: -(v.z ?? 0) }
}

function get(points: Vec3[], index: number): Vec3 | null {
  const p = points[index]
  if (!p)
    return null
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
    return null
  return { x: p.x, y: p.y, z: p.z ?? 0 }
}

function isConfident(pose: PoseState, index: number, thresholds: { minVisibility: number, minPresence: number }): boolean {
  const lm = pose.worldLandmarks?.[index] ?? pose.landmarks2d?.[index]
  // User requirement: do not output anything when `visibility` is missing.
  if (!lm)
    return false

  if (lm.visibility == null || !Number.isFinite(lm.visibility))
    return false

  if (lm.visibility != null && Number.isFinite(lm.visibility) && lm.visibility < thresholds.minVisibility)
    return false
  if (thresholds.minPresence > 0 && lm.presence != null && Number.isFinite(lm.presence) && lm.presence < thresholds.minPresence)
    return false
  return true
}

function mid(a: Vec3, b: Vec3): Vec3 {
  return vScale(vAdd(a, b), 0.5)
}

export function poseToVrmTargets(pose: PoseState, options?: PoseToVrmOptions): VrmPoseTargets {
  const points = pose.worldLandmarks
  if (!points?.length)
    return {}

  const axis = options?.axis ?? DEFAULT_AXIS
  const thresholds = {
    minVisibility: options?.confidence?.minVisibility ?? DEFAULT_MIN_VISIBILITY,
    minPresence: options?.confidence?.minPresence ?? DEFAULT_MIN_PRESENCE,
  }

  const getC = (index: number) => (isConfident(pose, index, thresholds) ? get(points, index) : null)

  const leftShoulder = getC(11)
  const rightShoulder = getC(12)
  const leftElbow = getC(13)
  const rightElbow = getC(14)
  const leftWrist = getC(15)
  const rightWrist = getC(16)
  const leftHip = getC(23)
  const rightHip = getC(24)
  const leftKnee = getC(25)
  const rightKnee = getC(26)
  const leftAnkle = getC(27)
  const rightAnkle = getC(28)

  const out: VrmPoseTargets = {}

  const shoulderCenter = leftShoulder && rightShoulder ? mid(leftShoulder, rightShoulder) : null
  const hipCenter = leftHip && rightHip ? mid(leftHip, rightHip) : null

  const prevTargets = options?.stabilize?.previousTargets
  const stabilizePole = (key: keyof VrmPoseTargets, pole: Vec3): Vec3 => {
    const prev = prevTargets?.[key]?.pole
    if (prev && vDot(prev, pole) < 0)
      return vNeg(pole)
    return pole
  }

  // Torso forward (for yaw): cross(hipRight-leftHip, up)
  let torsoForward: Vec3 | null = null
  if (leftHip && rightHip && hipCenter && shoulderCenter) {
    const lr = vSub(rightHip, leftHip)
    const upRaw = vSub(shoulderCenter, hipCenter)
    const fw = vNormalize(vRemapAxis(vCross(lr, upRaw), axis))
    if (fw) {
      const prevForward = options?.stabilize?.previousForward ?? prevTargets?.hips?.pole ?? prevTargets?.spine?.pole
      torsoForward = prevForward && vDot(prevForward, fw) < 0 ? vNeg(fw) : fw
    }
  }

  // Hips/spine/chest: drive "up" with a stable forward pole so the avatar can turn with you.
  if (hipCenter && shoulderCenter) {
    const up = vNormalize(vRemapAxis(vSub(shoulderCenter, hipCenter), axis))
    if (up) {
      if (torsoForward)
        out.hips = { dir: up, pole: stabilizePole('hips', torsoForward) }
      else
        out.hips = { dir: up }

      if (torsoForward)
        out.spine = { dir: up, pole: stabilizePole('spine', torsoForward) }
      else
        out.spine = { dir: up }

      // Chest: reuse spine for now (works well enough for pose-only).
      out.chest = out.spine.pole ? { dir: out.spine.dir, pole: stabilizePole('chest', out.spine.pole) } : { dir: out.spine.dir }
    }
  }

  // Shoulder (clavicle-ish): shoulder center -> shoulder
  if (shoulderCenter && leftShoulder) {
    const d = vNormalize(vRemapAxis(vSub(leftShoulder, shoulderCenter), axis))
    if (d)
      out.leftShoulder = { dir: d }
  }
  if (shoulderCenter && rightShoulder) {
    const d = vNormalize(vRemapAxis(vSub(rightShoulder, shoulderCenter), axis))
    if (d)
      out.rightShoulder = { dir: d }
  }

  // Arms (with pole from elbow bend plane)
  if (leftShoulder && leftElbow) {
    const upper = vNormalize(vRemapAxis(vSub(leftElbow, leftShoulder), axis))
    if (upper) {
      const poleRaw = leftWrist ? vCross(vSub(leftElbow, leftShoulder), vSub(leftWrist, leftElbow)) : null
      const pole = poleRaw ? vNormalize(vRemapAxis(poleRaw, axis)) : null
      out.leftUpperArm = pole ? { dir: upper, pole } : { dir: upper }
    }
  }
  if (leftElbow && leftWrist) {
    const lower = vNormalize(vRemapAxis(vSub(leftWrist, leftElbow), axis))
    if (lower)
      out.leftLowerArm = { dir: lower }
  }
  if (rightShoulder && rightElbow) {
    const upper = vNormalize(vRemapAxis(vSub(rightElbow, rightShoulder), axis))
    if (upper) {
      const poleRaw = rightWrist ? vCross(vSub(rightElbow, rightShoulder), vSub(rightWrist, rightElbow)) : null
      const pole = poleRaw ? vNormalize(vRemapAxis(poleRaw, axis)) : null
      out.rightUpperArm = pole ? { dir: upper, pole } : { dir: upper }
    }
  }
  if (rightElbow && rightWrist) {
    const lower = vNormalize(vRemapAxis(vSub(rightWrist, rightElbow), axis))
    if (lower)
      out.rightLowerArm = { dir: lower }
  }

  // Legs (with pole from knee bend plane)
  if (leftHip && leftKnee) {
    const upper = vNormalize(vRemapAxis(vSub(leftKnee, leftHip), axis))
    if (upper) {
      const poleRaw = leftAnkle ? vCross(vSub(leftKnee, leftHip), vSub(leftAnkle, leftKnee)) : null
      const pole = poleRaw ? vNormalize(vRemapAxis(poleRaw, axis)) : null
      out.leftUpperLeg = pole ? { dir: upper, pole } : { dir: upper }
    }
  }
  if (leftKnee && leftAnkle) {
    const lower = vNormalize(vRemapAxis(vSub(leftAnkle, leftKnee), axis))
    if (lower)
      out.leftLowerLeg = { dir: lower }
  }
  if (rightHip && rightKnee) {
    const upper = vNormalize(vRemapAxis(vSub(rightKnee, rightHip), axis))
    if (upper) {
      const poleRaw = rightAnkle ? vCross(vSub(rightKnee, rightHip), vSub(rightAnkle, rightKnee)) : null
      const pole = poleRaw ? vNormalize(vRemapAxis(poleRaw, axis)) : null
      out.rightUpperLeg = pole ? { dir: upper, pole } : { dir: upper }
    }
  }
  if (rightKnee && rightAnkle) {
    const lower = vNormalize(vRemapAxis(vSub(rightAnkle, rightKnee), axis))
    if (lower)
      out.rightLowerLeg = { dir: lower }
  }

  return out
}

export function poseToVrmDirections(pose: PoseState, options?: PoseToVrmOptions): VrmPoseDirections {
  const targets = poseToVrmTargets(pose, options)
  const out: VrmPoseDirections = {}
  ;(Object.keys(targets) as (keyof VrmPoseDirections)[]).forEach((k) => {
    const t = targets[k]
    if (t)
      out[k] = t.dir
  })
  return out
}

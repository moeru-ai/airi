import type { Vector3Like } from 'three'

import type { PoseState } from '../types'

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
    previousForward?: Vector3Like
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
  Vector3Like
>>

export interface VrmPoseTarget {
  dir: Vector3Like
  pole?: Vector3Like
}

export type VrmPoseTargets = Partial<Record<keyof VrmPoseDirections, VrmPoseTarget>>

const DEFAULT_AXIS = { x: 1 as const, y: 1 as const, z: 1 as const }
const DEFAULT_MIN_VISIBILITY = 0.5
const DEFAULT_MIN_PRESENCE = 0

// TODO: Consider consolidating these vector helpers into a shared math utility if more drivers need them.
function vSub(a: Vector3Like, b: Vector3Like): Vector3Like {
  return { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) }
}

function vAdd(a: Vector3Like, b: Vector3Like): Vector3Like {
  return { x: a.x + b.x, y: a.y + b.y, z: (a.z ?? 0) + (b.z ?? 0) }
}

function vScale(v: Vector3Like, s: number): Vector3Like {
  return { x: v.x * s, y: v.y * s, z: (v.z ?? 0) * s }
}

function vLen(v: Vector3Like): number {
  return Math.hypot(v.x, v.y, v.z ?? 0)
}

function vNormalize(v: Vector3Like): Vector3Like | null {
  const len = vLen(v)
  if (!Number.isFinite(len) || len <= 1e-6)
    return null
  return vScale(v, 1 / len)
}

function vRemapAxis(v: Vector3Like, axis: { x: 1 | -1, y: 1 | -1, z: 1 | -1 }): Vector3Like {
  return { x: v.x * axis.x, y: v.y * axis.y, z: (v.z ?? 0) * axis.z }
}

function vCross(a: Vector3Like, b: Vector3Like): Vector3Like {
  const az = a.z ?? 0
  const bz = b.z ?? 0
  return {
    x: a.y * bz - az * b.y,
    y: az * b.x - a.x * bz,
    z: a.x * b.y - a.y * b.x,
  }
}

function vDot(a: Vector3Like, b: Vector3Like): number {
  return a.x * b.x + a.y * b.y + (a.z ?? 0) * (b.z ?? 0)
}

function vNeg(v: Vector3Like): Vector3Like {
  return { x: -v.x, y: -v.y, z: -(v.z ?? 0) }
}

function safePole(dir: Vector3Like, pole: Vector3Like, threshold = 0.85): Vector3Like | null {
  const d = Math.abs(vDot(dir, pole))
  if (!Number.isFinite(d))
    return null
  return d > threshold ? null : pole
}

function get(points: Vector3Like[], index: number): Vector3Like | null {
  const p = points[index]
  if (!p)
    return null
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
    return null
  return { x: p.x, y: p.y, z: p.z ?? 0 }
}

// NOTICE: mediapipe doesn't provide this type correctly, so we define it here.
interface LandmarkWithPresence { presence?: number }
interface LandmarkWithVisibility { visibility?: number }

function getOptionalPresence(landmark: unknown): number | undefined {
  if (landmark && typeof landmark === 'object' && 'presence' in landmark)
    return (landmark as LandmarkWithPresence).presence
  return undefined
}

function getOptionalVisibility(landmark: unknown): number | undefined {
  if (landmark && typeof landmark === 'object' && 'visibility' in landmark)
    return (landmark as LandmarkWithVisibility).visibility
  return undefined
}

function isConfident(pose: PoseState, index: number, thresholds: { minVisibility: number, minPresence: number }): boolean {
  // User requirement: do not output anything when `visibility` is missing.
  // Prefer 2D landmarks for visibility/presence (they are more consistently populated),
  // but still allow fallback to world landmarks when needed.
  const lm2d = pose.landmarks2d?.[index]
  const lm3d = pose.worldLandmarks?.[index]
  if (!lm2d && !lm3d)
    return false

  const visibility = getOptionalVisibility(lm2d) ?? getOptionalVisibility(lm3d)
  if (visibility == null || !Number.isFinite(visibility))
    return false
  if (visibility < thresholds.minVisibility)
    return false

  if (thresholds.minPresence > 0) {
    const presence = getOptionalPresence(lm2d) ?? getOptionalPresence(lm3d)
    if (presence != null && Number.isFinite(presence) && presence < thresholds.minPresence)
      return false
  }
  return true
}

function mid(a: Vector3Like, b: Vector3Like): Vector3Like {
  return vScale(vAdd(a, b), 0.5)
}

export function poseToVrmTargets(pose: PoseState, options?: PoseToVrmOptions): VrmPoseTargets {
  // Prefer world landmarks when available; fallback to normalized landmarks to keep the pipeline usable.
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
  const stabilizePole = (key: keyof VrmPoseTargets, pole: Vector3Like): Vector3Like => {
    const prev = prevTargets?.[key]?.pole
    if (prev && vDot(prev, pole) < 0)
      return vNeg(pole)
    return pole
  }

  // Torso basis:
  // - up: hipCenter -> shoulderCenter (dir)
  // - right: leftShoulder -> rightShoulder
  // - forward: cross(right, up)
  //
  // NOTICE: In apply-pose-to-vrm.ts, pole is used as the Z axis in `makeBasis(X=dir, Y=..., Z=pole)`,
  // so torso pole must be "forward-like" (body facing), not "right-like" (shoulder line).
  let torsoForward: Vector3Like | null = null
  if (hipCenter && shoulderCenter && leftShoulder && rightShoulder) {
    const rightRaw = vSub(rightShoulder, leftShoulder)
    const upRaw = vSub(shoulderCenter, hipCenter)
    const right = vNormalize(vRemapAxis(rightRaw, axis))
    const up = vNormalize(vRemapAxis(upRaw, axis))
    if (right && up) {
      // Base forward from right×up, then fix sign so that (up×forward) matches observed shoulder-right.
      let fw = vNormalize(vCross(right, up))
      if (fw) {
        const rightFromBasis = vNormalize(vCross(fw, up))
        if (rightFromBasis && vDot(rightFromBasis, right) < 0)
          fw = vNeg(fw)

        const prevForward = options?.stabilize?.previousForward ?? prevTargets?.hips?.pole ?? prevTargets?.spine?.pole ?? prevTargets?.chest?.pole
        torsoForward = prevForward && vDot(prevForward, fw) < 0 ? vNeg(fw) : fw
      }
    }
  }

  // Hips/spine/chest: drive "up" with forward pole so the avatar can turn with you.
  if (hipCenter && shoulderCenter) {
    const up = vNormalize(vRemapAxis(vSub(shoulderCenter, hipCenter), axis))
    if (up) {
      if (torsoForward)
        out.hips = { dir: up, pole: stabilizePole('hips', torsoForward) }
      else
        out.hips = { dir: up }

      if (torsoForward) {
        out.spine = { dir: up, pole: stabilizePole('spine', torsoForward) }
        out.chest = { dir: up, pole: stabilizePole('chest', torsoForward) }
      }
      else {
        out.spine = { dir: up }
        out.chest = { dir: up }
      }
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

  // Legs: require ankle to reduce hallucinated flips when lower body is off-screen
  if (leftHip && leftKnee && leftAnkle) {
    const upper = vNormalize(vRemapAxis(vSub(leftKnee, leftHip), axis))
    if (upper) {
      const poleRaw = vCross(vSub(leftKnee, leftHip), vSub(leftAnkle, leftKnee))
      let pole = vNormalize(vRemapAxis(poleRaw, axis))
      if (pole)
        pole = stabilizePole('leftUpperLeg', pole)
      if (pole)
        pole = safePole(upper, pole)
      out.leftUpperLeg = pole ? { dir: upper, pole } : { dir: upper }
    }

    const lower = vNormalize(vRemapAxis(vSub(leftAnkle, leftKnee), axis))
    if (lower)
      out.leftLowerLeg = { dir: lower }
  }

  if (rightHip && rightKnee && rightAnkle) {
    const upper = vNormalize(vRemapAxis(vSub(rightKnee, rightHip), axis))
    if (upper) {
      const poleRaw = vCross(vSub(rightKnee, rightHip), vSub(rightAnkle, rightKnee))
      let pole = vNormalize(vRemapAxis(poleRaw, axis))
      if (pole)
        pole = stabilizePole('rightUpperLeg', pole)
      if (pole)
        pole = safePole(upper, pole)
      out.rightUpperLeg = pole ? { dir: upper, pole } : { dir: upper }
    }

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

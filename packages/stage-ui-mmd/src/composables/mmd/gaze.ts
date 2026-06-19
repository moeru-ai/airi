import type { Bone, SkinnedMesh } from 'three'

import { Euler, MathUtils, Quaternion } from 'three'

/** Normalized screen-space gaze offset, each axis in roughly [-1, 1]. */
export interface GazeOffset {
  x: number
  y: number
}

// Eyes can swing further than the head; values in radians.
export const EYE_YAW_LIMIT = 0.35
export const EYE_PITCH_LIMIT = 0.25
const HEAD_YAW_LIMIT = 0.2
const HEAD_PITCH_LIMIT = 0.12

// Idle saccade tuning — small, infrequent darts when nothing is tracked.
const SACCADE_MIN_MS = 400
const SACCADE_MAX_MS = 2200
const SACCADE_RANGE = 0.4

// Candidate bone names (semi-standard MMD first, then common English exports).
const LEFT_EYE_NAMES = ['左目', 'eye_L', 'EyeLeft', 'LeftEye']
const RIGHT_EYE_NAMES = ['右目', 'eye_R', 'EyeRight', 'RightEye']
const BOTH_EYES_NAMES = ['両目', 'Eyes']
const HEAD_NAMES = ['頭', 'head', 'Head']

function findBone(mesh: SkinnedMesh, names: string[]): Bone | undefined {
  for (const name of names) {
    const bone = mesh.skeleton.bones.find(b => b.name === name)
    if (bone)
      return bone
  }
  return undefined
}

interface GazeBone {
  bone: Bone
  rest: Quaternion
}

export interface GazeController {
  /** Drives gaze toward a normalized offset; pass `undefined` to idle-saccade. */
  update: (offset: GazeOffset | undefined, delta: number) => void
}

/**
 * Bone-based eye gaze and subtle head aim for MMD models.
 *
 * VRM exposes a first-class `lookAt`; MMD does not, so we rotate the eye bones
 * and add a damped fraction of the same aim to the head bone for a natural
 * follow. Rotations are applied relative to each bone's rest pose and must run
 * after `MMDAnimationHelper.update()` so they layer on top of the active
 * motion.
 *
 * We rotate the actual `左目`/`右目` eye bones (which the eyeballs are skinned
 * to) rather than the `両目` control bone. `両目` drives the eyes through the
 * append/grant solver, which runs *inside* `helper.update()`; rotating it
 * afterward would be too late and the eyes would not move. `両目` is used only
 * as a fallback when a model lacks separate eye bones.
 *
 * When no tracking target is supplied the controller produces small idle
 * saccades, matching the VRM renderer's resting-eye behavior.
 */
export function createGazeController(mesh: SkinnedMesh): GazeController {
  const eyeBones: GazeBone[] = []
  const left = findBone(mesh, LEFT_EYE_NAMES)
  const right = findBone(mesh, RIGHT_EYE_NAMES)
  if (left)
    eyeBones.push({ bone: left, rest: left.quaternion.clone() })
  if (right)
    eyeBones.push({ bone: right, rest: right.quaternion.clone() })

  // Fallback: a single both-eyes bone the eyeballs are skinned to directly.
  if (eyeBones.length === 0) {
    const both = findBone(mesh, BOTH_EYES_NAMES)
    if (both)
      eyeBones.push({ bone: both, rest: both.quaternion.clone() })
  }

  if (eyeBones.length === 0) {
    console.warn(
      '[mmd] gaze: no eye bone matched (左目/右目/両目); eye tracking disabled. '
      + 'Bones containing 目/eye:',
      mesh.skeleton.bones.filter(b => /目|eye/i.test(b.name)).map(b => b.name),
    )
  }

  const headBoneRaw = findBone(mesh, HEAD_NAMES)
  const headBone: GazeBone | undefined = headBoneRaw
    ? { bone: headBoneRaw, rest: headBoneRaw.quaternion.clone() }
    : undefined

  // Smoothed current aim, lerped toward the target each frame.
  const current: GazeOffset = { x: 0, y: 0 }
  const scratchEuler = new Euler()
  const scratchQuat = new Quaternion()

  // Idle saccade state.
  let saccade: GazeOffset = { x: 0, y: 0 }
  let nextSaccadeIn = 0

  function applyBone(target: GazeBone, yaw: number, pitch: number) {
    // Yaw about Y, pitch about X, relative to the bone's rest pose.
    scratchEuler.set(pitch, yaw, 0, 'XYZ')
    scratchQuat.setFromEuler(scratchEuler)
    target.bone.quaternion.copy(target.rest).multiply(scratchQuat)
  }

  return {
    update(offset, delta) {
      let desired = offset
      if (!desired) {
        nextSaccadeIn -= delta * 1000
        if (nextSaccadeIn <= 0) {
          saccade = {
            x: MathUtils.randFloat(-SACCADE_RANGE, SACCADE_RANGE),
            y: MathUtils.randFloat(-SACCADE_RANGE, SACCADE_RANGE),
          }
          nextSaccadeIn = MathUtils.randFloat(SACCADE_MIN_MS, SACCADE_MAX_MS)
        }
        desired = saccade
      }

      // Critically-damped-ish approach; frame-rate independent.
      const rate = 1 - Math.exp(-10 * delta)
      current.x += (desired.x - current.x) * rate
      current.y += (desired.y - current.y) * rate

      // Positive cursor-x (right) turns gaze toward screen-right; positive
      // cursor-y (down) looks down.
      for (const eye of eyeBones)
        applyBone(eye, current.x * EYE_YAW_LIMIT, current.y * EYE_PITCH_LIMIT)

      if (headBone)
        applyBone(headBone, current.x * HEAD_YAW_LIMIT, current.y * HEAD_PITCH_LIMIT)
    },
  }
}

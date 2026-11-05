import type { VRM, VRMHumanBoneName } from '@pixiv/three-vrm'
import type { AnimationClip } from 'three'

import { Euler, Quaternion, QuaternionKeyframeTrack } from 'three'

import { proceduralAxisSign } from './procedural-axes'

/**
 * Hand-to-chin stance in normalized humanoid space (T-pose rest, Euler XYZ, radians).
 * Normalized bones have an identity rest rotation on every VRM. Tuned on the Neptuna test model
 * (VRM 0.x), front and side view. A VRM 1.0 gets x and z flipped, see `proceduralAxisSign`.
 * The right hand rests at the chin, and the left forearm crosses the waist.
 */
const thinkingPose: Partial<Record<VRMHumanBoneName, [number, number, number]>> = {
  rightUpperArm: [0, 0.55, -1.3],
  rightLowerArm: [0, 2.7, 0.2],
  rightHand: [0, 0, -0.3],
  leftUpperArm: [0, -0.4, 1.25],
  leftLowerArm: [0, -1.6, 0],
}

/**
 * Builds a thinking clip from an idle clip: the arms hold the hand-to-chin stance,
 * and every other bone keeps the motion of the idle, so she still breathes and sways.
 * The head turn comes from the performance director, not from this clip.
 */
export function createThinkingClip(vrm: VRM, idle: AnimationClip): AnimationClip {
  const clip = idle.clone()
  clip.name = `${idle.name}:thinking`
  const duration = Math.max(clip.duration, 1)
  const sign = proceduralAxisSign(vrm)

  for (const [boneName, [x, y, z]] of Object.entries(thinkingPose) as Array<[VRMHumanBoneName, [number, number, number]]>) {
    const node = vrm.humanoid.getNormalizedBoneNode(boneName)
    if (!node)
      continue
    const trackName = `${node.name}.quaternion`
    clip.tracks = clip.tracks.filter(track => track.name !== trackName)
    const q = new Quaternion().setFromEuler(new Euler(sign * x, y, sign * z, 'XYZ'))
    clip.tracks.push(new QuaternionKeyframeTrack(trackName, [0, duration], [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w]))
  }
  clip.resetDuration()
  return clip
}

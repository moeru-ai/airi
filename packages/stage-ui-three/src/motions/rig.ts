import type { VRMCore, VRMHumanBoneName } from '@pixiv/three-vrm-core'

import { AnimationClip, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three'

/** Uses the normalized rest pose, independent of playback and scene placement. */
export function measureRig(vrm: VRMCore) {
  const rest = vrm.humanoid.normalizedRestPose
  const offset = (name: VRMHumanBoneName) => {
    const position = rest[name]?.position
    return position ? new Vector3().fromArray(position) : new Vector3(0, -0.01, 0)
  }
  const leftThigh = offset('leftLowerLeg')
  const leftShin = offset('leftFoot')
  const rightThigh = offset('rightLowerLeg')
  const rightShin = offset('rightFoot')
  const hipsPosition = new Vector3()
  const hipsRest = rest.hips?.position
  if (hipsRest)
    hipsPosition.fromArray(hipsRest)
  const height = Math.max(leftThigh.length() + leftShin.length(), rightThigh.length() + rightShin.length()) * 2
  return { leftThigh, leftShin, rightThigh, rightShin, hipsPosition, height }
}

/**
 * Keeps normalized body rotations and bounded hips translation in a new clip.
 * Expressions, gaze bones, materials, scale, and scene transforms remain outside this runtime.
 */
export function createBodyClip(source: AnimationClip, vrm: VRMCore) {
  if (!Number.isFinite(source.duration) || source.duration <= 0)
    throw new Error('The motion duration must be positive and finite.')

  const allowedRotations = new Map<string, string>()
  const allowedPositions = new Map<string, string>()
  for (const [name, bone] of Object.entries(vrm.humanoid.normalizedHumanBones)) {
    if (name === 'leftEye' || name === 'rightEye' || name === 'jaw')
      continue
    const node = bone.node
    const rotationTarget = `${node.uuid}.quaternion`
    allowedRotations.set(rotationTarget, rotationTarget)
    if (node.name && vrm.scene.getObjectByName(node.name) === node)
      allowedRotations.set(`${node.name}.quaternion`, rotationTarget)
    if (name === 'hips') {
      const positionTarget = `${node.uuid}.position`
      allowedPositions.set(positionTarget, positionTarget)
      if (node.name && vrm.scene.getObjectByName(node.name) === node)
        allowedPositions.set(`${node.name}.position`, positionTarget)
    }
  }

  const rig = measureRig(vrm)
  const seen = new Set<string>()
  const tracks: (QuaternionKeyframeTrack | VectorKeyframeTrack)[] = []
  for (const track of source.tracks) {
    const isRotation = track instanceof QuaternionKeyframeTrack
    const isPosition = track instanceof VectorKeyframeTrack
    if (!isRotation && !isPosition)
      continue
    const target = (isRotation ? allowedRotations : allowedPositions).get(track.name)
    if (!target || seen.has(target))
      continue
    const size = isRotation ? 4 : 3
    if (track.times.length === 0 || track.values.length !== track.times.length * size
      || !track.times.every((time, index) => Number.isFinite(time) && time >= 0 && (index === 0 || time > track.times[index - 1]))
      || !track.values.every(Number.isFinite)) {
      throw new Error('The motion contains invalid body keyframes.')
    }
    const copy = track.clone()
    copy.name = target
    if (isPosition) {
      const origin = new Vector3().fromArray(copy.values)
      const offset = new Vector3()
      for (let index = 0; index < copy.values.length; index += 3) {
        offset.fromArray(copy.values, index).sub(origin)
        // Imported root drift stays inside the avatar's frame. The scene owns stage placement.
        const horizontal = Math.hypot(offset.x, offset.z)
        if (horizontal > rig.height * 0.2) {
          offset.x *= rig.height * 0.2 / horizontal
          offset.z *= rig.height * 0.2 / horizontal
        }
        offset.y = Math.max(-rig.height * 0.25, Math.min(rig.height * 0.25, offset.y))
        offset.add(rig.hipsPosition).toArray(copy.values, index)
      }
    }
    else {
      for (let index = 0; index < copy.values.length; index += 4) {
        const magnitude = Math.hypot(copy.values[index], copy.values[index + 1], copy.values[index + 2], copy.values[index + 3])
        if (magnitude < 0.000001)
          throw new Error('The motion contains an invalid bone rotation.')
        for (let component = 0; component < 4; component++)
          copy.values[index + component] /= magnitude
      }
    }
    seen.add(target)
    tracks.push(copy)
  }
  if (tracks.length === 0)
    throw new Error('The motion has no supported humanoid body tracks.')
  return new AnimationClip(source.name, source.duration, tracks)
}

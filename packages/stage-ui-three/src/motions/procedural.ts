import type { VRMCore, VRMHumanBoneName } from '@pixiv/three-vrm-core'
import type { Vector3 } from 'three'

import { AnimationClip, Euler, Quaternion, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three'

import { measureRig } from './rig'

type Angles = [number, number, number]
type Pose = Partial<Record<VRMHumanBoneName, Angles>>

function smooth(value: number) {
  const clamped = Math.max(0, Math.min(1, value))
  return clamped * clamped * (3 - 2 * clamped)
}

function envelope(progress: number) {
  return smooth(progress / 0.22) * smooth((1 - progress) / 0.24)
}

function plantLeg(pose: Pose, side: 'left' | 'right', thighRest: Vector3, shinRest: Vector3, hipDrop: number, hipDepth: number) {
  // The sagittal two-link solution preserves the ankle point and each bone's lateral rest offset.
  const thigh = Math.max(0.01, Math.hypot(thighRest.y, thighRest.z))
  const shin = Math.max(0.01, Math.hypot(shinRest.y, shinRest.z))
  const vertical = -thighRest.y - shinRest.y - hipDrop
  const depth = thighRest.z + shinRest.z - hipDepth
  const reach = Math.max(Math.abs(thigh - shin) + 0.000001, Math.min(thigh + shin - 0.000001, Math.hypot(vertical, depth)))
  const angle = Math.atan2(-depth, vertical)
  const thighOffset = Math.acos(Math.max(-1, Math.min(1, (thigh * thigh + reach * reach - shin * shin) / (2 * thigh * reach))))
  const knee = Math.PI - Math.acos(Math.max(-1, Math.min(1, (thigh * thigh + shin * shin - reach * reach) / (2 * thigh * shin))))
  const thighRestAngle = Math.atan2(-thighRest.z, -thighRest.y)
  const shinRestAngle = Math.atan2(-shinRest.z, -shinRest.y)
  const upper = angle - thighOffset - thighRestAngle
  const lower = knee + thighRestAngle - shinRestAngle
  pose[`${side}UpperLeg`] = [upper, 0, 0]
  pose[`${side}LowerLeg`] = [lower, 0, 0]
  pose[`${side}Foot`] = [-upper - lower, 0, 0]
}

/**
 * Builds original motion against the normalized rig. No model or animation asset is required.
 * Leg lengths set the hips height and planted-foot bend for each avatar.
 */
export function createProceduralClip(vrm: VRMCore, id: string, duration: number) {
  const rig = measureRig(vrm)
  const times: number[] = []
  const positions: number[] = []
  const rotations = new Map<VRMHumanBoneName, number[]>()
  const samples = Math.ceil(duration * 30)
  const euler = new Euler()
  const quaternion = new Quaternion()
  const bones = Object.keys(vrm.humanoid.normalizedHumanBones) as VRMHumanBoneName[]
  for (const bone of bones) {
    if (bone !== 'leftEye' && bone !== 'rightEye' && bone !== 'jaw')
      rotations.set(bone, [])
  }

  for (let frame = 0; frame <= samples; frame++) {
    const progress = frame / samples
    const phase = progress * Math.PI * 2
    const hold = envelope(progress)
    const beat = Math.sin(phase)
    const pose: Pose = {
      leftUpperArm: [0, 0, -1.25],
      rightUpperArm: [0, 0, 1.25],
      leftLowerArm: [0, -0.1, -0.12],
      rightLowerArm: [0, 0.1, 0.12],
    }
    let drop = 0
    let depth = 0

    switch (id) {
      case 'natural-idle': {
        drop += rig.height * 0.0015 * (1 - Math.cos(phase))
        pose.spine = [0.012 * beat, 0, 0.008 * Math.sin(phase * 2)]
        pose.chest = [-0.015 * beat, 0, -0.006 * Math.sin(phase * 2)]
        pose.head = [0.006 * beat, 0.012 * beat, 0]
        pose.leftUpperArm = [0.02 * beat, 0, -1.28 + 0.015 * beat]
        pose.rightUpperArm = [-0.015 * beat, 0, 1.28 + 0.015 * beat]
        break
      }
      case 'bow': {
        drop += rig.height * 0.018 * hold
        depth = -rig.height * 0.018 * hold
        pose.spine = [0.65 * hold, 0, 0]
        pose.chest = [0.12 * hold, 0, 0]
        pose.neck = [0.08 * hold, 0, 0]
        pose.head = [0.1 * hold, 0, 0]
        pose.leftUpperArm = [-0.25 * hold, 0, -1.25 - 0.1 * hold]
        pose.rightUpperArm = [-0.25 * hold, 0, 1.25 + 0.1 * hold]
        break
      }
      case 'dance': {
        drop += rig.height * 0.016 * (1 - Math.cos(phase * 2))
        pose.spine = [0.04 * Math.sin(phase * 2), 0.12 * beat, 0.12 * beat]
        pose.chest = [0, -0.08 * beat, -0.07 * beat]
        pose.head = [0, -0.05 * beat, -0.05 * beat]
        pose.leftUpperArm = [0.35 * beat, -0.15, -0.75 + 0.25 * beat]
        pose.rightUpperArm = [-0.35 * beat, 0.15, 0.75 + 0.25 * beat]
        pose.leftLowerArm = [0, -0.55 - 0.25 * beat, -0.3]
        pose.rightLowerArm = [0, 0.55 - 0.25 * beat, 0.3]
        break
      }
      case 'run-circle': {
        // The gentle jog limits displacement. Clothing and floor clearance still depend on the avatar.
        drop = rig.height * 0.0015 * (1 - Math.cos(phase * 2))
        pose.spine = [0.12, 0.08 * beat, 0]
        pose.chest = [0.05, -0.1 * beat, 0]
        pose.head = [-0.12, 0, 0]
        pose.leftUpperArm = [0.65 * beat, 0, -1.34]
        pose.rightUpperArm = [-0.65 * beat, 0, 1.34]
        pose.leftLowerArm = [0, -1.25, 0]
        pose.rightLowerArm = [0, 1.25, 0]
        pose.leftUpperLeg = [-0.28 * beat, 0, 0]
        pose.rightUpperLeg = [0.28 * beat, 0, 0]
        pose.leftLowerLeg = [0.2 + 1.25 * Math.max(0, -beat), 0, 0]
        pose.rightLowerLeg = [0.2 + 1.25 * Math.max(0, beat), 0, 0]
        pose.leftFoot = [-0.15 - 0.3 * Math.max(0, -beat), 0, 0]
        pose.rightFoot = [-0.15 - 0.3 * Math.max(0, beat), 0, 0]
        break
      }
      case 'wave': {
        pose.rightUpperArm = [-0.3 * hold, 0, 1.25 - 1.45 * hold]
        pose.rightLowerArm = [0, 0.2 * hold, (-1.55 + 0.28 * Math.sin(phase * 3)) * hold]
        pose.rightHand = [0, 0, 0.25 * Math.sin(phase * 3) * hold]
        pose.spine = [0, -0.06 * hold, 0]
        pose.head = [0, -0.05 * hold, -0.05 * hold]
        break
      }
      case 'nod': {
        pose.head = [0.2 * Math.sin(phase * 2) * hold, 0, 0]
        pose.neck = [0.04 * Math.sin(phase * 2) * hold, 0, 0]
        break
      }
      case 'shake-head': {
        pose.head = [0, 0.28 * Math.sin(phase * 2) * hold, 0]
        break
      }
      case 'celebrate': {
        drop += rig.height * 0.018 * (1 - Math.cos(phase * 2)) * hold
        pose.leftUpperArm = [0, 0, -1.25 + 2.3 * hold]
        pose.rightUpperArm = [0, 0, 1.25 - 2.3 * hold]
        pose.leftLowerArm = [0, -0.15, -0.3 * hold]
        pose.rightLowerArm = [0, 0.15, 0.3 * hold]
        pose.chest = [-0.07 * hold, 0, 0]
        break
      }
      case 'stretch': {
        pose.leftUpperArm = [0, 0, -1.25 + 2.75 * hold]
        pose.rightUpperArm = [0, 0, 1.25 - 2.75 * hold]
        pose.spine = [0, 0, 0.12 * beat * hold]
        pose.chest = [-0.04 * hold, 0, 0.08 * beat * hold]
        break
      }
      case 'present': {
        pose.rightUpperArm = [-0.25 * hold, 0.1 * hold, 1.25 - 0.65 * hold]
        pose.rightLowerArm = [0.15 * hold, 0.7 * hold, 0.12]
        pose.rightHand = [0, 0, -0.4 * hold]
        pose.spine = [0, -0.1 * hold, 0]
        pose.head = [0, -0.15 * hold, 0]
        break
      }
      default:
        throw new Error(`Procedural motion "${id}" is not defined.`)
    }

    if (id !== 'run-circle') {
      plantLeg(pose, 'left', rig.leftThigh, rig.leftShin, drop, depth)
      plantLeg(pose, 'right', rig.rightThigh, rig.rightShin, drop, depth)
    }
    times.push(progress * duration)
    positions.push(rig.hipsPosition.x, rig.hipsPosition.y - drop, rig.hipsPosition.z + depth)
    for (const [bone, values] of rotations) {
      const angles = pose[bone]
      euler.set(angles?.[0] ?? 0, angles?.[1] ?? 0, angles?.[2] ?? 0, 'XYZ')
      quaternion.setFromEuler(euler).toArray(values, values.length)
    }
  }

  const tracks: (QuaternionKeyframeTrack | VectorKeyframeTrack)[] = []
  for (const [bone, values] of rotations) {
    const node = vrm.humanoid.getNormalizedBoneNode(bone)
    if (node)
      tracks.push(new QuaternionKeyframeTrack(`${node.uuid}.quaternion`, times, values))
  }
  const hips = vrm.humanoid.getNormalizedBoneNode('hips')
  if (hips)
    tracks.push(new VectorKeyframeTrack(`${hips.uuid}.position`, times, positions))
  return new AnimationClip(id, duration, tracks)
}

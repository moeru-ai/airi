import type { VRM } from '@pixiv/three-vrm'
import type { Object3D } from 'three'

import type { EnqueueGestureFramesOptions, GestureFrame, VrmUpperBodyBone } from './types'

import { MathUtils, Quaternion } from 'three'

interface AbsoluteGestureFrame {
  atMs: number
  weight: number
  bones: Partial<Record<VrmUpperBodyBone, Quaternion>>
}

function clamp01(value: number) {
  return MathUtils.clamp(value, 0, 1)
}

export function useGestureStream() {
  const frames: AbsoluteGestureFrame[] = []
  let cursor = 0
  let cachedVrm: VRM | undefined
  const boneCache: Partial<Record<VrmUpperBodyBone, Object3D>> = {}
  const lastEnqueuedBoneQuat: Partial<Record<VrmUpperBodyBone, Quaternion>> = {}
  const boneWeightScale: Partial<Record<VrmUpperBodyBone, number>> = {
    hips: 0.4,
    spine: 0.5,
    chest: 0.7,
    upperChest: 0.7,
    neck: 0.35,
    head: 0.25,
    leftShoulder: 0.6,
    rightShoulder: 0.6,
    leftUpperArm: 0.8,
    rightUpperArm: 0.8,
    leftLowerArm: 0.6,
    rightLowerArm: 0.6,
    leftHand: 0.5,
    rightHand: 0.5,
  }
  let globalRotationScale = 1

  function reset() {
    frames.length = 0
    cursor = 0
    cachedVrm = undefined
    for (const key of Object.keys(boneCache) as VrmUpperBodyBone[])
      delete boneCache[key]
    for (const key of Object.keys(lastEnqueuedBoneQuat) as VrmUpperBodyBone[])
      delete lastEnqueuedBoneQuat[key]
  }

  function clear() {
    frames.length = 0
    cursor = 0
    for (const key of Object.keys(lastEnqueuedBoneQuat) as VrmUpperBodyBone[])
      delete lastEnqueuedBoneQuat[key]
  }

  function enqueue(inputFrames: GestureFrame[] | GestureFrame, nowMs: number, options?: EnqueueGestureFramesOptions) {
    const list = Array.isArray(inputFrames) ? inputFrames : [inputFrames]
    if (list.length === 0)
      return

    const startAtMs = options?.startAtMs ?? nowMs
    for (const frame of list) {
      const bones: AbsoluteGestureFrame['bones'] = {}
      for (const [bone, value] of Object.entries(frame.bones) as Array<[VrmUpperBodyBone, { rot: [number, number, number, number] } | undefined]>) {
        if (!value?.rot)
          continue
        const quat = new Quaternion(value.rot[0], value.rot[1], value.rot[2], value.rot[3]).normalize()
        // Ensure quaternion continuity across frames. Quaternions q and -q represent the same rotation,
        // but mixing both signs can cause visible pops when interpolating against the current pose.
        const prev = lastEnqueuedBoneQuat[bone]
        if (prev && prev.dot(quat) < 0) {
          quat.x = -quat.x
          quat.y = -quat.y
          quat.z = -quat.z
          quat.w = -quat.w
        }
        bones[bone] = quat
        lastEnqueuedBoneQuat[bone] = quat.clone()
      }
      frames.push({
        atMs: startAtMs + Math.max(0, frame.t),
        weight: clamp01(frame.weight ?? 1),
        bones,
      })
    }

    frames.sort((a, b) => a.atMs - b.atMs)
    cursor = MathUtils.clamp(cursor, 0, Math.max(0, frames.length - 1))
  }

  function getBoneNode(vrm: VRM, bone: VrmUpperBodyBone) {
    if (cachedVrm !== vrm) {
      cachedVrm = vrm
      for (const key of Object.keys(boneCache) as VrmUpperBodyBone[])
        delete boneCache[key]
    }

    const cached = boneCache[bone]
    if (cached)
      return cached

    // Apply gestures onto raw bones. Base VRMAnimation clips are applied to normalized bones first,
    // then transferred into raw bones via `humanoid.update()` in the render loop.
    const node = vrm.humanoid?.getRawBoneNode(bone as any) as unknown as Object3D | undefined
    if (!node)
      return

    boneCache[bone] = node
    return node
  }

  function setBoneWeightScale(scales: Partial<Record<VrmUpperBodyBone, number>>) {
    for (const [bone, scale] of Object.entries(scales) as Array<[VrmUpperBodyBone, number]>) {
      if (!Number.isFinite(scale))
        continue
      boneWeightScale[bone] = scale
    }
  }

  function setAxisCorrection(_options: {
    global?: Quaternion | [number, number, number, number]
    perBone?: Partial<Record<VrmUpperBodyBone, Quaternion | [number, number, number, number]>>
  }) {}

  function setRotationScale(scale: number) {
    if (!Number.isFinite(scale))
      return
    globalRotationScale = MathUtils.clamp(scale, 0, 1)
  }

  function update(vrm: VRM | undefined, nowMs: number) {
    if (!vrm || frames.length === 0)
      return

    while (cursor + 1 < frames.length && frames[cursor + 1].atMs <= nowMs)
      cursor += 1

    // Prune frames that are far behind "now" to keep memory bounded.
    if (cursor > 4) {
      frames.splice(0, cursor - 2)
      cursor = 2
    }

    const a = frames[cursor]
    const b = frames[cursor + 1]
    if (!a)
      return

    const alpha = b
      ? clamp01((nowMs - a.atMs) / Math.max(1, b.atMs - a.atMs))
      : 0

    const bonesToApply = new Set<VrmUpperBodyBone>([
      ...Object.keys(a.bones) as VrmUpperBodyBone[],
      ...(b ? (Object.keys(b.bones) as VrmUpperBodyBone[]) : []),
    ])

    for (const bone of bonesToApply) {
      if (bone === 'chest' || bone === 'upperChest' || bone === 'spine')
        continue
      const qa = a.bones[bone]
      const qb = b?.bones[bone]
      if (!qa && !qb)
        continue

      // Treat incoming rotations as a delta to be applied on top of the current pose
      // (which may already include base VRMAnimation clips).
      const target = (qa ?? qb)!.clone()
      if (qa && qb)
        target.slerp(qb, alpha)

      const node = getBoneNode(vrm, bone)
      if (!node)
        continue

      const weight = b ? MathUtils.lerp(a.weight, b.weight, alpha) : a.weight
      const scaledWeight = clamp01(weight * (boneWeightScale[bone] ?? 1))
      const effectiveWeight = clamp01(scaledWeight * globalRotationScale)
      node.quaternion.slerp(target, effectiveWeight)
    }
  }

  return {
    enqueue,
    update,
    clear,
    reset,
    setBoneWeightScale,
    setAxisCorrection,
    setRotationScale,
  }
}

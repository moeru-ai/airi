import type { VRM } from '@pixiv/three-vrm'

import type { VrmPoseDirections, VrmPoseTarget, VrmPoseTargets } from './pose-to-vrm'

import { Matrix4, Quaternion, Vector3 } from 'three'

export interface VrmPoseApplyOptions {
  /**
   * Slerp factor per frame in [0..1]. Higher = snappier, lower = smoother.
   */
  alpha?: number
  /**
   * Reject sudden flips: if the target direction is close to the opposite of the
   * current bone direction (in world space), skip this update.
   *
   * `minDot` in [-1..1]. Example: `-0.2` rejects angles > ~101°.
   */
  minDotBeforeReject?: number
  /**
   * Similar to `minDotBeforeReject`, but applied to the pole vector when using
   * pole-based orientation. Helps avoid 180° roll/yaw flips when the pole sign
   * becomes ambiguous.
   */
  minPoleDotBeforeReject?: number
}

type BoneKey = keyof VrmPoseDirections

interface BoneChain {
  bone: string
  childCandidates: readonly string[]
}

const DEFAULT_ALPHA = 0.35

const CHAINS: Readonly<Record<BoneKey, BoneChain>> = {
  hips: {
    bone: 'hips',
    childCandidates: ['spine'],
  },
  spine: {
    bone: 'spine',
    childCandidates: ['chest', 'upperChest', 'neck'],
  },
  chest: {
    bone: 'chest',
    childCandidates: ['upperChest', 'neck'],
  },
  leftShoulder: {
    bone: 'leftShoulder',
    childCandidates: ['leftUpperArm'],
  },
  rightShoulder: {
    bone: 'rightShoulder',
    childCandidates: ['rightUpperArm'],
  },
  leftUpperArm: {
    bone: 'leftUpperArm',
    childCandidates: ['leftLowerArm'],
  },
  leftLowerArm: {
    bone: 'leftLowerArm',
    childCandidates: ['leftHand'],
  },
  rightUpperArm: {
    bone: 'rightUpperArm',
    childCandidates: ['rightLowerArm'],
  },
  rightLowerArm: {
    bone: 'rightLowerArm',
    childCandidates: ['rightHand'],
  },
  leftUpperLeg: {
    bone: 'leftUpperLeg',
    childCandidates: ['leftLowerLeg'],
  },
  leftLowerLeg: {
    bone: 'leftLowerLeg',
    childCandidates: ['leftFoot'],
  },
  rightUpperLeg: {
    bone: 'rightUpperLeg',
    childCandidates: ['rightLowerLeg'],
  },
  rightLowerLeg: {
    bone: 'rightLowerLeg',
    childCandidates: ['rightFoot'],
  },
} as const

const POLE_KEYS: ReadonlySet<BoneKey> = new Set(Object.keys(CHAINS) as BoneKey[])
const LIMB_POLE_KEYS: ReadonlySet<BoneKey> = new Set([
  'leftUpperArm',
  'rightUpperArm',
  'leftUpperLeg',
  'rightUpperLeg',
])

function isFiniteVec3(v: { x: number, y: number, z?: number } | undefined): v is { x: number, y: number, z?: number } {
  if (!v)
    return false
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z ?? 0)
}

function firstExistingBone(vrm: VRM, candidates: readonly string[]) {
  for (const name of candidates) {
    const node = vrm.humanoid?.getNormalizedBoneNode(name as any)
    if (node)
      return node
  }
  return null
}

function grandchildCandidatesFor(key: BoneKey): readonly string[] {
  if (key === 'leftUpperArm')
    return ['leftHand']
  if (key === 'rightUpperArm')
    return ['rightHand']
  if (key === 'leftUpperLeg')
    return ['leftFoot']
  if (key === 'rightUpperLeg')
    return ['rightFoot']
  return []
}

function orthonormalizePole(dir: Vector3, pole: Vector3): Vector3 | null {
  const poleOrtho = pole.clone().addScaledVector(dir, -pole.dot(dir))
  if (poleOrtho.lengthSq() <= 1e-12)
    return null
  return poleOrtho.normalize()
}

export function createVrmPoseApplier(options?: VrmPoseApplyOptions) {
  const alpha = options?.alpha ?? DEFAULT_ALPHA
  const minDotBeforeReject = options?.minDotBeforeReject ?? -0.2
  const minPoleDotBeforeReject = options?.minPoleDotBeforeReject ?? -0.2

  const restDirLocal: Partial<Record<BoneKey, Vector3>> = {}
  const restPoleLocal: Partial<Record<BoneKey, Vector3>> = {}
  const lastTargetDirWorld: Partial<Record<BoneKey, Vector3>> = {}
  const lastTargetPoleWorld: Partial<Record<BoneKey, Vector3>> = {}

  const tmpBoneWorldQ = new Quaternion()
  const tmpParentWorldQ = new Quaternion()
  const tmpDeltaQ = new Quaternion()
  const tmpNewWorldQ = new Quaternion()
  const tmpNewLocalQ = new Quaternion()

  const tmpRestM = new Matrix4()
  const tmpTargetM = new Matrix4()
  const tmpRotM = new Matrix4()

  const tmpBoneWorldPos = new Vector3()
  const tmpChildWorldPos = new Vector3()
  const tmpGrandWorldPos = new Vector3()
  const tmpDirWorld = new Vector3()
  const tmpDirLocal = new Vector3()
  const tmpCurrentDirWorld = new Vector3()
  const tmpTargetDirWorld = new Vector3()
  const tmpTargetPoleWorld = new Vector3()
  const tmpRestDirLocal = new Vector3()
  const tmpRestPoleLocal = new Vector3()
  const tmpRestYLocal = new Vector3()
  const tmpTargetYWorld = new Vector3()
  const tmpWorldForward = new Vector3(0, 0, -1)

  function ensureRestDirection(vrm: VRM, key: BoneKey): Vector3 | null {
    const existing = restDirLocal[key]
    if (existing)
      return existing

    const chain = CHAINS[key]
    const bone = vrm.humanoid?.getNormalizedBoneNode(chain.bone as any)
    if (!bone)
      return null

    const child = firstExistingBone(vrm, chain.childCandidates)
    if (!child)
      return null

    bone.updateMatrixWorld(true)
    child.updateMatrixWorld(true)

    bone.getWorldQuaternion(tmpBoneWorldQ)
    bone.getWorldPosition(tmpBoneWorldPos)
    child.getWorldPosition(tmpChildWorldPos)

    tmpDirWorld.copy(tmpChildWorldPos).sub(tmpBoneWorldPos).normalize()
    tmpDirLocal.copy(tmpDirWorld).applyQuaternion(tmpBoneWorldQ.clone().invert()).normalize()

    const stored = tmpDirLocal.clone()
    restDirLocal[key] = stored
    return stored
  }

  function ensureRestPole(vrm: VRM, key: BoneKey): Vector3 | null {
    if (!POLE_KEYS.has(key))
      return null

    const existing = restPoleLocal[key]
    if (existing)
      return existing

    const chain = CHAINS[key]
    const bone = vrm.humanoid?.getNormalizedBoneNode(chain.bone as any)
    if (!bone)
      return null

    bone.updateMatrixWorld(true)
    bone.getWorldQuaternion(tmpBoneWorldQ)

    if (LIMB_POLE_KEYS.has(key)) {
      const child = firstExistingBone(vrm, chain.childCandidates)
      if (!child)
        return null

      const grandCandidates = grandchildCandidatesFor(key)
      const grand = grandCandidates.length ? firstExistingBone(vrm, grandCandidates) : null
      if (!grand)
        return null

      child.updateMatrixWorld(true)
      grand.updateMatrixWorld(true)

      bone.getWorldPosition(tmpBoneWorldPos)
      child.getWorldPosition(tmpChildWorldPos)
      grand.getWorldPosition(tmpGrandWorldPos)

      const dir1 = tmpChildWorldPos.clone().sub(tmpBoneWorldPos)
      const dir2 = tmpGrandWorldPos.clone().sub(tmpChildWorldPos)
      tmpDirWorld.copy(dir1).cross(dir2)
      if (tmpDirWorld.lengthSq() <= 1e-12)
        return null
      tmpDirWorld.normalize()

      tmpDirLocal.copy(tmpDirWorld).applyQuaternion(tmpBoneWorldQ.clone().invert()).normalize()
      const stored = tmpDirLocal.clone()
      restPoleLocal[key] = stored
      return stored
    }

    // For torso: use "world forward" as rest pole, transformed into bone local.
    tmpDirLocal.copy(tmpWorldForward).applyQuaternion(tmpBoneWorldQ.clone().invert()).normalize()
    const stored = tmpDirLocal.clone()
    restPoleLocal[key] = stored
    return stored
  }

  function applyOne(vrm: VRM, key: BoneKey, target: VrmPoseTarget) {
    const chain = CHAINS[key]
    const bone = vrm.humanoid?.getNormalizedBoneNode(chain.bone as any)
    if (!bone)
      return

    const rest = ensureRestDirection(vrm, key)
    if (!rest)
      return

    tmpTargetDirWorld.set(target.dir.x, target.dir.y, target.dir.z ?? 0)
    if (tmpTargetDirWorld.lengthSq() <= 1e-12)
      return
    tmpTargetDirWorld.normalize()

    // Reject near-180° instant flips based on previous target (not current bone pose).
    // Using the current bone direction is unreliable when tracking reacquires or when
    // the bind pose differs from the mocap space.
    const prevDir = lastTargetDirWorld[key]
    if (prevDir && prevDir.dot(tmpTargetDirWorld) < minDotBeforeReject)
      return

    bone.updateMatrixWorld(true)
    bone.getWorldQuaternion(tmpBoneWorldQ)

    const parent = bone.parent
    if (parent) {
      parent.updateMatrixWorld(true)
      parent.getWorldQuaternion(tmpParentWorldQ)
    }
    else {
      tmpParentWorldQ.identity()
    }

    const restPole = target.pole ? ensureRestPole(vrm, key) : null
    const usePole = !!(target.pole && restPole)

    if (usePole) {
      tmpRestDirLocal.copy(rest).normalize()
      tmpRestPoleLocal.copy(restPole!).normalize()
      tmpRestPoleLocal.addScaledVector(tmpRestDirLocal, -tmpRestPoleLocal.dot(tmpRestDirLocal)).normalize()
      tmpRestYLocal.copy(tmpRestPoleLocal).cross(tmpRestDirLocal).normalize()

      tmpTargetPoleWorld.set(target.pole!.x, target.pole!.y, target.pole!.z ?? 0)
      if (tmpTargetPoleWorld.lengthSq() <= 1e-12)
        return
      tmpTargetPoleWorld.normalize()
      const poleOrtho = orthonormalizePole(tmpTargetDirWorld, tmpTargetPoleWorld)
      if (!poleOrtho)
        return
      tmpTargetPoleWorld.copy(poleOrtho)
      tmpTargetYWorld.copy(tmpTargetPoleWorld).cross(tmpTargetDirWorld).normalize()

      // Reject near-180° pole flips based on previous target pole.
      const prevPole = lastTargetPoleWorld[key]
      if (prevPole && prevPole.dot(tmpTargetPoleWorld) < minPoleDotBeforeReject)
        return

      tmpRestM.makeBasis(tmpRestDirLocal, tmpRestYLocal, tmpRestPoleLocal)
      tmpTargetM.makeBasis(tmpTargetDirWorld, tmpTargetYWorld, tmpTargetPoleWorld)

      tmpRotM.copy(tmpTargetM).multiply(tmpRestM.clone().invert())
      tmpNewWorldQ.setFromRotationMatrix(tmpRotM)
      tmpNewLocalQ.copy(tmpParentWorldQ).invert().multiply(tmpNewWorldQ)
    }
    else {
      tmpCurrentDirWorld.copy(rest).applyQuaternion(tmpBoneWorldQ).normalize()
      tmpDeltaQ.setFromUnitVectors(tmpCurrentDirWorld, tmpTargetDirWorld)
      tmpNewWorldQ.copy(tmpDeltaQ).multiply(tmpBoneWorldQ)
      tmpNewLocalQ.copy(tmpParentWorldQ).invert().multiply(tmpNewWorldQ)
    }

    if (alpha >= 1)
      bone.quaternion.copy(tmpNewLocalQ)
    else
      bone.quaternion.slerp(tmpNewLocalQ, alpha)

    // Update last targets only after a successful apply.
    lastTargetDirWorld[key] = tmpTargetDirWorld.clone()
    if (usePole)
      lastTargetPoleWorld[key] = tmpTargetPoleWorld.clone()
    else
      delete lastTargetPoleWorld[key]
  }

  function applyPoseDirectionsToVrm(vrm: VRM, directions: VrmPoseDirections) {
    if (!vrm.humanoid)
      return

    (Object.keys(CHAINS) as BoneKey[]).forEach((key) => {
      const d = directions[key]
      if (!isFiniteVec3(d))
        return
      applyOne(vrm, key, { dir: d })
    })
  }

  function applyPoseTargetsToVrm(vrm: VRM, targets: VrmPoseTargets) {
    if (!vrm.humanoid)
      return

    (Object.keys(CHAINS) as BoneKey[]).forEach((key) => {
      const t = targets[key]
      if (!t || !isFiniteVec3(t.dir))
        return
      if (t.pole && !isFiniteVec3(t.pole))
        return
      applyOne(vrm, key, t)
    })
  }

  return { applyPoseDirectionsToVrm, applyPoseTargetsToVrm }
}

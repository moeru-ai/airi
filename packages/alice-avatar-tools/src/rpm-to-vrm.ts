import type { Glb, GltfNode } from './glb'
import type { Mat4, Quat, Vec3 } from './math'

import { AccessorView } from './glb'
import {
  fromTrs,
  invert,
  multiply,
  normalize,
  quatFromMatrix,
  quatFromUnitVectors,
  quatInvert,
  quatMultiply,
  quatNormalize,
  subtract,
  transformPoint,
  transformVector,
  translationOf,
} from './math'

/**
 * Converts a Ready Player Me avatar (GLB with an ARKit and Oculus viseme face) to VRM 1.0.
 *
 * Sprint V4 of Plan 04: the Eva avatar of the mirror becomes a VRM, so the AIRI motion layer
 * (V1 to V3) can drive her. The converter:
 * 1. Turns the A pose of the arms into the T pose that VRM 1.0 and VRMA animations expect.
 *    It moves the arm bones, then re-skins the mesh, the morph target deltas, and the inverse bind matrices,
 *    so the mesh in rest pose matches the new skeleton.
 * 2. Adds the `VRMC_vrm` extension: humanoid bones, preset expressions from the ARKit and viseme blend shapes,
 *    every blend shape as a custom expression, eye bone look-at, and the meta data.
 * Textures, materials, and blend shapes stay as they are.
 */

export interface ConvertOptions {
  name: string
  authors: string[]
  version?: string
  /** Other license terms of the source avatar, for example the Ready Player Me terms. */
  otherLicenseUrl?: string
}

export interface ConvertReport {
  /** Arm direction before and after, in degrees below the horizontal. */
  armDropBeforeDegrees: number
  armDropAfterDegrees: number
  humanBones: number
  presetExpressions: string[]
  customExpressions: number
  /** Blend shapes that a preset expression wanted but the avatar does not have. */
  missingBlendShapes: string[]
  vertices: number
}

/** VRM humanoid bone name to Ready Player Me (Mixamo style) node name. */
export const rpmHumanBones: Record<string, string> = {
  hips: 'Hips',
  spine: 'Spine',
  chest: 'Spine1',
  upperChest: 'Spine2',
  neck: 'Neck',
  head: 'Head',
  leftEye: 'LeftEye',
  rightEye: 'RightEye',
  leftUpperLeg: 'LeftUpLeg',
  leftLowerLeg: 'LeftLeg',
  leftFoot: 'LeftFoot',
  leftToes: 'LeftToeBase',
  rightUpperLeg: 'RightUpLeg',
  rightLowerLeg: 'RightLeg',
  rightFoot: 'RightFoot',
  rightToes: 'RightToeBase',
  leftShoulder: 'LeftShoulder',
  leftUpperArm: 'LeftArm',
  leftLowerArm: 'LeftForeArm',
  leftHand: 'LeftHand',
  rightShoulder: 'RightShoulder',
  rightUpperArm: 'RightArm',
  rightLowerArm: 'RightForeArm',
  rightHand: 'RightHand',
  ...fingerBones('left', 'Left'),
  ...fingerBones('right', 'Right'),
}

function fingerBones(vrmSide: string, rpmSide: string) {
  const bones: Record<string, string> = {
    [`${vrmSide}ThumbMetacarpal`]: `${rpmSide}HandThumb1`,
    [`${vrmSide}ThumbProximal`]: `${rpmSide}HandThumb2`,
    [`${vrmSide}ThumbDistal`]: `${rpmSide}HandThumb3`,
  }
  for (const [vrmFinger, rpmFinger] of [['Index', 'Index'], ['Middle', 'Middle'], ['Ring', 'Ring'], ['Little', 'Pinky']]) {
    bones[`${vrmSide}${vrmFinger}Proximal`] = `${rpmSide}Hand${rpmFinger}1`
    bones[`${vrmSide}${vrmFinger}Intermediate`] = `${rpmSide}Hand${rpmFinger}2`
    bones[`${vrmSide}${vrmFinger}Distal`] = `${rpmSide}Hand${rpmFinger}3`
  }
  return bones
}

const requiredHumanBones = ['hips', 'spine', 'head', 'leftUpperArm', 'leftLowerArm', 'leftHand', 'rightUpperArm', 'rightLowerArm', 'rightHand', 'leftUpperLeg', 'leftLowerLeg', 'leftFoot', 'rightUpperLeg', 'rightLowerLeg', 'rightFoot']

/**
 * Preset expressions from blend shape weights. The model faces +Z, so its left is +X.
 * `lookLeft` means the eyes turn to the left of the character: out on the left eye, in on the right eye.
 */
export const presetBlendShapes: Record<string, Record<string, number>> = {
  aa: { viseme_aa: 1 },
  ih: { viseme_I: 1 },
  ou: { viseme_U: 1 },
  ee: { viseme_E: 1 },
  oh: { viseme_O: 1 },
  blink: { eyeBlinkLeft: 1, eyeBlinkRight: 1 },
  blinkLeft: { eyeBlinkLeft: 1 },
  blinkRight: { eyeBlinkRight: 1 },
  happy: { mouthSmileLeft: 0.8, mouthSmileRight: 0.8, cheekSquintLeft: 0.5, cheekSquintRight: 0.5, eyeSquintLeft: 0.3, eyeSquintRight: 0.3 },
  angry: { browDownLeft: 1, browDownRight: 1, noseSneerLeft: 0.4, noseSneerRight: 0.4, mouthPressLeft: 0.4, mouthPressRight: 0.4, eyeSquintLeft: 0.3, eyeSquintRight: 0.3 },
  sad: { browInnerUp: 0.8, mouthFrownLeft: 0.7, mouthFrownRight: 0.7, mouthShrugLower: 0.3 },
  relaxed: { mouthSmileLeft: 0.4, mouthSmileRight: 0.4, eyeSquintLeft: 0.4, eyeSquintRight: 0.4 },
  surprised: { browInnerUp: 1, browOuterUpLeft: 1, browOuterUpRight: 1, eyeWideLeft: 1, eyeWideRight: 1, jawOpen: 0.35 },
  neutral: {},
  lookUp: { eyeLookUpLeft: 1, eyeLookUpRight: 1 },
  lookDown: { eyeLookDownLeft: 1, eyeLookDownRight: 1 },
  lookLeft: { eyeLookOutLeft: 1, eyeLookInRight: 1 },
  lookRight: { eyeLookInLeft: 1, eyeLookOutRight: 1 },
}

/** Arm chains that the T pose straightens, with the world direction of each bone. */
const tPoseChains: Array<[bone: string, child: string, direction: Vec3]> = [
  ['LeftArm', 'LeftForeArm', [1, 0, 0]],
  ['LeftForeArm', 'LeftHand', [1, 0, 0]],
  ['LeftHand', 'LeftHandMiddle1', [1, 0, 0]],
  ['RightArm', 'RightForeArm', [-1, 0, 0]],
  ['RightForeArm', 'RightHand', [-1, 0, 0]],
  ['RightHand', 'RightHandMiddle1', [-1, 0, 0]],
]

class Skeleton {
  readonly parent = new Map<number, number>()
  private readonly cache = new Map<number, Mat4>()

  constructor(private readonly nodes: GltfNode[]) {
    nodes.forEach((node, index) => {
      if (node.matrix)
        throw new Error(`Node ${node.name ?? index} uses a matrix. Only TRS nodes are supported.`)
      for (const child of node.children ?? [])
        this.parent.set(child, index)
    })
  }

  local(index: number): Mat4 {
    const node = this.nodes[index]
    return fromTrs(node.translation, node.rotation, node.scale)
  }

  world(index: number): Mat4 {
    const cached = this.cache.get(index)
    if (cached)
      return cached
    const parent = this.parent.get(index)
    const world = parent === undefined ? this.local(index) : multiply(this.world(parent), this.local(index))
    this.cache.set(index, world)
    return world
  }

  invalidate() {
    this.cache.clear()
  }
}

function armDropDegrees(skeleton: Skeleton, nodeIndex: Map<string, number>) {
  const from = translationOf(skeleton.world(nodeIndex.get('LeftArm')!))
  const to = translationOf(skeleton.world(nodeIndex.get('LeftForeArm')!))
  const [x, y] = normalize(subtract(to, from))
  return Math.atan2(-y, x) * 180 / Math.PI
}

/**
 * Converts in place. The GLB must not be a VRM already.
 *
 * Before: a Ready Player Me GLB, for example the Eva avatar of the mirror.
 * After: the same GLB with T pose arms and the `VRMC_vrm` extension. Write it with `writeGlb` as `.vrm`.
 */
export function convertRpmToVrm(glb: Glb, options: ConvertOptions): ConvertReport {
  const { json } = glb
  if (json.extensionsUsed?.includes('VRMC_vrm') || json.extensions?.VRMC_vrm)
    throw new Error('The file is a VRM already')
  const nodeIndex = new Map<string, number>()
  json.nodes.forEach((node, index) => {
    if (node.name)
      nodeIndex.set(node.name, index)
  })
  for (const bone of requiredHumanBones) {
    if (!nodeIndex.has(rpmHumanBones[bone]))
      throw new Error(`The avatar has no ${rpmHumanBones[bone]} node for the VRM bone ${bone}`)
  }

  const skeleton = new Skeleton(json.nodes)
  const armDropBeforeDegrees = armDropDegrees(skeleton, nodeIndex)

  // 1. T pose: turn each arm bone so it points along the X axis. Parents first, so children follow.
  for (const [boneName, childName, direction] of tPoseChains) {
    const bone = nodeIndex.get(boneName)
    const child = nodeIndex.get(childName)
    if (bone === undefined || child === undefined)
      continue
    const current = normalize(subtract(translationOf(skeleton.world(child)), translationOf(skeleton.world(bone))))
    const turn = quatFromUnitVectors(current, direction)
    const worldRotation = quatMultiply(turn, quatFromMatrix(skeleton.world(bone)))
    const parent = skeleton.parent.get(bone)
    const parentRotation: Quat = parent === undefined ? [0, 0, 0, 1] : quatFromMatrix(skeleton.world(parent))
    json.nodes[bone].rotation = quatNormalize(quatMultiply(quatInvert(parentRotation), worldRotation))
    skeleton.invalidate()
  }

  // 2. Re-skin every skinned mesh to the new rest pose and write the new inverse bind matrices.
  let vertices = 0
  const rebound = new Set<number>()
  // An accessor that two primitives share must be transformed once.
  const transformed = new Set<number>()
  json.nodes.forEach((node, meshNode) => {
    if (node.mesh === undefined || node.skin === undefined)
      return
    const skin = json.skins![node.skin]
    if (skin.inverseBindMatrices === undefined)
      throw new Error('A skin without inverse bind matrices is not supported')
    const inverseBinds = new AccessorView(glb, skin.inverseBindMatrices)
    const meshWorld = skeleton.world(meshNode)
    const meshWorldInverse = invert(meshWorld)
    const jointMatrices = skin.joints.map((joint, slot) => {
      const inverseBind = new Float64Array(16)
      for (let i = 0; i < 16; i++)
        inverseBind[i] = inverseBinds.get(slot, i)
      return multiply(meshWorldInverse, multiply(skeleton.world(joint), inverseBind))
    })

    for (const primitive of json.meshes[node.mesh].primitives) {
      if (transformed.has(primitive.attributes.POSITION))
        continue
      for (const index of [primitive.attributes.POSITION, primitive.attributes.NORMAL, ...(primitive.targets ?? []).flatMap(target => [target.POSITION, target.NORMAL])]) {
        if (index !== undefined)
          transformed.add(index)
      }
      const positions = new AccessorView(glb, primitive.attributes.POSITION)
      const normals = primitive.attributes.NORMAL === undefined ? undefined : new AccessorView(glb, primitive.attributes.NORMAL)
      const joints = new AccessorView(glb, primitive.attributes.JOINTS_0)
      const weights = new AccessorView(glb, primitive.attributes.WEIGHTS_0)
      const targets = (primitive.targets ?? []).flatMap(target => [target.POSITION, target.NORMAL]).filter((index): index is number => index !== undefined).map(index => new AccessorView(glb, index))

      for (let vertex = 0; vertex < positions.count; vertex++) {
        const blended = new Float64Array(16)
        for (let k = 0; k < 4; k++) {
          const weight = weights.get(vertex, k)
          if (weight === 0)
            continue
          const matrix = jointMatrices[joints.get(vertex, k)]
          for (let i = 0; i < 16; i++)
            blended[i] += weight * matrix[i]
        }
        const position = transformPoint(blended, [positions.get(vertex, 0), positions.get(vertex, 1), positions.get(vertex, 2)])
        position.forEach((value, component) => positions.set(vertex, component, value))
        if (normals) {
          const normal = normalize(transformVector(blended, [normals.get(vertex, 0), normals.get(vertex, 1), normals.get(vertex, 2)]))
          normal.forEach((value, component) => normals.set(vertex, component, value))
        }
        for (const target of targets) {
          const delta = transformVector(blended, [target.get(vertex, 0), target.get(vertex, 1), target.get(vertex, 2)])
          delta.forEach((value, component) => target.set(vertex, component, value))
        }
      }
      positions.updateBounds()
      for (const target of targets)
        target.updateBounds()
      vertices += positions.count
    }

    // The rest pose is now the bind pose: joint world times inverse bind is the identity again.
    if (!rebound.has(node.skin)) {
      skin.joints.forEach((joint, slot) => {
        const inverseBind = multiply(invert(skeleton.world(joint)), meshWorld)
        for (let i = 0; i < 16; i++)
          inverseBinds.set(slot, i, inverseBind[i])
      })
      rebound.add(node.skin)
    }
  })

  // 3. The VRM 1.0 extension.
  const morphOwners = json.nodes
    .map((node, index) => ({ node: index, names: node.mesh === undefined ? [] : json.meshes[node.mesh].extras?.targetNames ?? [] }))
    .filter(owner => owner.names.length > 0)
  const missing = new Set<string>()
  const binds = (weights: Record<string, number>) => Object.entries(weights).flatMap(([blendShape, weight]) => {
    const found = morphOwners.flatMap(owner => owner.names.includes(blendShape) ? [{ node: owner.node, index: owner.names.indexOf(blendShape), weight }] : [])
    if (found.length === 0)
      missing.add(blendShape)
    return found
  })

  const preset: Record<string, unknown> = {}
  for (const [name, weights] of Object.entries(presetBlendShapes)) {
    const isMouth = ['aa', 'ih', 'ou', 'ee', 'oh'].includes(name)
    const isEmotion = ['happy', 'angry', 'sad', 'relaxed', 'surprised'].includes(name)
    preset[name] = {
      morphTargetBinds: binds(weights),
      isBinary: false,
      // An emotion face lowers the blink and the mouth shapes, so they do not stack into a broken face.
      overrideBlink: isEmotion ? 'blend' : 'none',
      overrideLookAt: 'none',
      overrideMouth: isEmotion ? 'blend' : 'none',
      ...(isMouth && { overrideMouth: 'none' }),
    }
  }
  const custom: Record<string, unknown> = {}
  for (const name of new Set(morphOwners.flatMap(owner => owner.names))) {
    if (!(name in presetBlendShapes))
      custom[name] = { morphTargetBinds: binds({ [name]: 1 }), isBinary: false, overrideBlink: 'none', overrideLookAt: 'none', overrideMouth: 'none' }
  }

  const humanBones: Record<string, { node: number }> = {}
  for (const [vrmBone, rpmNode] of Object.entries(rpmHumanBones)) {
    const index = nodeIndex.get(rpmNode)
    if (index !== undefined)
      humanBones[vrmBone] = { node: index }
  }
  const head = translationOf(skeleton.world(nodeIndex.get('Head')!))
  const eye = nodeIndex.has('LeftEye') ? translationOf(skeleton.world(nodeIndex.get('LeftEye')!)) : head
  const range = { inputMaxValue: 90, outputScale: 10 }

  json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), 'VRMC_vrm'])]
  json.extensions = {
    ...json.extensions,
    VRMC_vrm: {
      specVersion: '1.0',
      meta: {
        name: options.name,
        version: options.version ?? '1.0',
        authors: options.authors,
        licenseUrl: 'https://vrm.dev/licenses/1.0/',
        avatarPermission: 'onlyAuthor',
        allowExcessivelyViolentUsage: false,
        allowExcessivelySexualUsage: false,
        commercialUsage: 'personalNonProfit',
        allowPoliticalOrReligiousUsage: false,
        allowAntisocialOrHateUsage: false,
        creditNotation: 'required',
        allowRedistribution: false,
        modification: 'prohibited',
        ...(options.otherLicenseUrl && { otherLicenseUrl: options.otherLicenseUrl }),
      },
      humanoid: { humanBones },
      expressions: { preset, custom },
      lookAt: {
        type: 'bone',
        offsetFromHeadBone: [0, eye[1] - head[1], eye[2] - head[2]],
        rangeMapHorizontalInner: range,
        rangeMapHorizontalOuter: range,
        rangeMapVerticalDown: range,
        rangeMapVerticalUp: range,
      },
    },
  }

  return {
    armDropBeforeDegrees,
    armDropAfterDegrees: armDropDegrees(skeleton, nodeIndex),
    humanBones: Object.keys(humanBones).length,
    presetExpressions: Object.keys(preset),
    customExpressions: Object.keys(custom).length,
    missingBlendShapes: [...missing],
    vertices,
  }
}

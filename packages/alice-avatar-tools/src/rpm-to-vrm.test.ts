import type { Glb, GltfJson, GltfNode } from './glb'
import type { Mat4, Quat, Vec3 } from './math'

import { Buffer } from 'node:buffer'

import { describe, expect, it } from 'vitest'

import { AccessorView, readGlb, writeGlb } from './glb'
import { fromTrs, identity, invert, multiply, transformPoint } from './math'
import { convertRpmToVrm } from './rpm-to-vrm'

const down45: Quat = [0, 0, -Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)]
const up45: Quat = [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)]

/** Bones of a minimal Ready Player Me style skeleton in A pose: the arms point 45 degrees down. */
const bones: Array<{ name: string, parent?: string, translation: Vec3, rotation?: Quat }> = [
  { name: 'Hips', translation: [0, 1, 0] },
  { name: 'Spine', parent: 'Hips', translation: [0, 0.2, 0] },
  { name: 'Head', parent: 'Spine', translation: [0, 0.4, 0] },
  { name: 'LeftArm', parent: 'Spine', translation: [0.2, 0.3, 0], rotation: down45 },
  { name: 'LeftForeArm', parent: 'LeftArm', translation: [0.3, 0, 0] },
  { name: 'LeftHand', parent: 'LeftForeArm', translation: [0.25, 0, 0] },
  { name: 'LeftHandMiddle1', parent: 'LeftHand', translation: [0.08, 0, 0] },
  { name: 'RightArm', parent: 'Spine', translation: [-0.2, 0.3, 0], rotation: up45 },
  { name: 'RightForeArm', parent: 'RightArm', translation: [-0.3, 0, 0] },
  { name: 'RightHand', parent: 'RightForeArm', translation: [-0.25, 0, 0] },
  { name: 'RightHandMiddle1', parent: 'RightHand', translation: [-0.08, 0, 0] },
  { name: 'LeftUpLeg', parent: 'Hips', translation: [0.1, 0, 0] },
  { name: 'LeftLeg', parent: 'LeftUpLeg', translation: [0, -0.45, 0] },
  { name: 'LeftFoot', parent: 'LeftLeg', translation: [0, -0.45, 0] },
  { name: 'RightUpLeg', parent: 'Hips', translation: [-0.1, 0, 0] },
  { name: 'RightLeg', parent: 'RightUpLeg', translation: [0, -0.45, 0] },
  { name: 'RightFoot', parent: 'RightLeg', translation: [0, -0.45, 0] },
]

function worldOf(name: string): Mat4 {
  const bone = bones.find(entry => entry.name === name)!
  const local = fromTrs(bone.translation, bone.rotation)
  return bone.parent ? multiply(worldOf(bone.parent), local) : local
}

function translation(m: Mat4): Vec3 {
  return [m[12], m[13], m[14]]
}

/**
 * Builds a skinned GLB: vertex 0 sits on the left hand (joint LeftHand), vertex 1 on the head (joint Head).
 * One morph target, `eyeBlinkLeft`, moves the head vertex down by 1 cm.
 */
function createAvatar(): Glb {
  const jointNames = ['LeftHand', 'Head']
  const nodes: GltfNode[] = bones.map(bone => ({ name: bone.name, translation: bone.translation, ...(bone.rotation && { rotation: bone.rotation }) }))
  bones.forEach((bone) => {
    if (bone.parent) {
      const parent = nodes[bones.findIndex(entry => entry.name === bone.parent)]
      parent.children = [...(parent.children ?? []), bones.findIndex(entry => entry.name === bone.name)]
    }
  })
  const meshNode = nodes.length
  nodes.push({ name: 'Wolf3D_Avatar', mesh: 0, skin: 0 })
  nodes.push({ name: 'Armature', children: [0, meshNode] })

  const hand = translation(worldOf('LeftHand'))
  const head = translation(worldOf('Head'))
  const floats = (values: number[]) => Buffer.from(new Float32Array(values).buffer)
  const chunks = [
    floats([...hand, ...head]),
    floats([0, 0, 1, 0, 0, 1]),
    Buffer.from(new Uint8Array([0, 0, 0, 0, 1, 0, 0, 0])),
    floats([1, 0, 0, 0, 1, 0, 0, 0]),
    floats([0, 0, 0, 0, -0.01, 0]),
    floats(jointNames.flatMap(name => [...invert(worldOf(name))])),
  ]
  const views: GltfJson['bufferViews'] = []
  let offset = 0
  for (const chunk of chunks) {
    views.push({ buffer: 0, byteOffset: offset, byteLength: chunk.length })
    offset += chunk.length
  }
  const json: GltfJson = {
    asset: { version: '2.0', generator: 'test' },
    nodes,
    scenes: [{ nodes: [meshNode + 1] }],
    meshes: [{
      name: 'Wolf3D_Avatar',
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1, JOINTS_0: 2, WEIGHTS_0: 3 }, targets: [{ POSITION: 4 }] }],
      extras: { targetNames: ['eyeBlinkLeft'] },
    }],
    skins: [{ joints: jointNames.map(name => bones.findIndex(entry => entry.name === name)), inverseBindMatrices: 5 }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 2, type: 'VEC3' },
      { bufferView: 1, componentType: 5126, count: 2, type: 'VEC3' },
      { bufferView: 2, componentType: 5121, count: 2, type: 'VEC4' },
      { bufferView: 3, componentType: 5126, count: 2, type: 'VEC4' },
      { bufferView: 4, componentType: 5126, count: 2, type: 'VEC3' },
      { bufferView: 5, componentType: 5126, count: 2, type: 'MAT4' },
    ],
    bufferViews: views,
    buffers: [{ byteLength: offset }],
  }
  return readGlb(writeGlb({ json, bin: Buffer.concat(chunks) }))
}

function vertex(glb: Glb, accessor: number, index: number): Vec3 {
  const view = new AccessorView(glb, accessor)
  return [view.get(index, 0), view.get(index, 1), view.get(index, 2)]
}

function nodeWorld(glb: Glb, name: string): Mat4 {
  const nodes = glb.json.nodes
  const index = nodes.findIndex(node => node.name === name)
  const parentOf = (child: number) => nodes.findIndex(node => node.children?.includes(child))
  let world = fromTrs(nodes[index].translation, nodes[index].rotation, nodes[index].scale)
  for (let parent = parentOf(index); parent >= 0; parent = parentOf(parent))
    world = multiply(fromTrs(nodes[parent].translation, nodes[parent].rotation, nodes[parent].scale), world)
  return world
}

describe('convertRpmToVrm', () => {
  it('turns the A pose arms into a T pose and moves the skinned mesh with them', () => {
    const glb = createAvatar()
    const headBefore = vertex(glb, 0, 1)

    const report = convertRpmToVrm(glb, { name: 'Test', authors: ['Tester'] })

    expect(report.armDropBeforeDegrees).toBeCloseTo(45, 3)
    expect(report.armDropAfterDegrees).toBeCloseTo(0, 3)
    const shoulder = translation(nodeWorld(glb, 'LeftArm'))
    const hand = translation(nodeWorld(glb, 'LeftHand'))
    expect(hand[1]).toBeCloseTo(shoulder[1], 5)
    expect(hand[0]).toBeCloseTo(shoulder[0] + 0.55, 5)
    // The hand vertex follows its joint. The head vertex and its blend shape do not move.
    vertex(glb, 0, 0).forEach((value, axis) => expect(value).toBeCloseTo(hand[axis], 5))
    vertex(glb, 0, 1).forEach((value, axis) => expect(value).toBeCloseTo(headBefore[axis], 5))
    expect(vertex(glb, 4, 1)[1]).toBeCloseTo(-0.01, 6)
  })

  it('writes inverse bind matrices that match the new rest pose', () => {
    const glb = createAvatar()
    convertRpmToVrm(glb, { name: 'Test', authors: ['Tester'] })

    const inverseBinds = new AccessorView(glb, 5)
    const handInverse = Float64Array.from({ length: 16 }, (_, i) => inverseBinds.get(0, i))
    const product = multiply(nodeWorld(glb, 'LeftHand'), handInverse)
    const expected = identity()
    product.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 5))
    expect(transformPoint(product, [1, 2, 3])[1]).toBeCloseTo(2, 5)
  })

  it('adds the VRM 1.0 extension with humanoid bones, presets, custom expressions, and meta', () => {
    const glb = createAvatar()
    const report = convertRpmToVrm(glb, { name: 'Eva', authors: ['Alice'] })
    const vrm = glb.json.extensions!.VRMC_vrm as Record<string, any>

    expect(glb.json.extensionsUsed).toContain('VRMC_vrm')
    expect(vrm.specVersion).toBe('1.0')
    expect(vrm.meta).toMatchObject({ name: 'Eva', authors: ['Alice'], allowRedistribution: false })
    expect(vrm.humanoid.humanBones.hips.node).toBe(0)
    expect(vrm.humanoid.humanBones.leftUpperArm.node).toBe(bones.findIndex(bone => bone.name === 'LeftArm'))
    expect(vrm.expressions.preset.blinkLeft.morphTargetBinds).toEqual([{ node: bones.length, index: 0, weight: 1 }])
    expect(vrm.expressions.preset.happy.overrideBlink).toBe('blend')
    expect(report.missingBlendShapes).toContain('mouthSmileLeft')
    // Every blend shape is also a custom expression, so ARKit names stay reachable.
    expect(report.customExpressions).toBe(1)
    expect(vrm.expressions.custom.eyeBlinkLeft.morphTargetBinds).toEqual([{ node: bones.length, index: 0, weight: 1 }])
  })

  it('survives a write and a read, and refuses a second conversion', () => {
    const glb = createAvatar()
    convertRpmToVrm(glb, { name: 'Eva', authors: ['Alice'] })
    const again = readGlb(writeGlb(glb))

    expect(again.json.extensions?.VRMC_vrm).toBeDefined()
    expect(() => convertRpmToVrm(again, { name: 'Eva', authors: ['Alice'] })).toThrow('VRM already')
  })

  it('refuses an avatar without the required bones', () => {
    const glb = createAvatar()
    glb.json.nodes.find(node => node.name === 'LeftFoot')!.name = 'LeftFootOld'

    expect(() => convertRpmToVrm(glb, { name: 'Eva', authors: ['Alice'] })).toThrow('LeftFoot')
  })
})

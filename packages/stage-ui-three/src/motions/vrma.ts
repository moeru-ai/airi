import type { VRMCore } from '@pixiv/three-vrm-core'

import { createVRMAnimationClip, VRMAnimation, VRMAnimationLoaderPlugin } from '@pixiv/three-vrm-animation'
import { VRMHumanBoneName } from '@pixiv/three-vrm-core'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

import * as v from 'valibot'

/** Import errors use stable codes so settings can translate them. */
export class MotionImportError extends Error {
  constructor(public readonly code: 'format' | 'size' | 'external' | 'animation' | 'missing' | 'interpolation') {
    super(code)
  }
}

const indexSchema = v.pipe(v.number(), v.integer(), v.minValue(0))
const vectorSchema = (length: number) => v.pipe(v.array(v.pipe(v.number(), v.finite())), v.length(length))
const documentSchema = v.object({
  asset: v.object({ version: v.literal('2.0') }),
  extensions: v.object({
    VRMC_vrm_animation: v.object({
      specVersion: v.string(),
      humanoid: v.optional(v.object({ humanBones: v.record(v.picklist(Object.values(VRMHumanBoneName)), v.object({ node: indexSchema })) })),
    }),
  }),
  extensionsUsed: v.optional(v.array(v.literal('VRMC_vrm_animation'))),
  buffers: v.optional(v.pipe(v.array(v.object({ byteLength: indexSchema, uri: v.optional(v.string()) })), v.maxLength(1))),
  bufferViews: v.optional(v.pipe(v.array(v.object({ buffer: indexSchema, byteOffset: v.optional(indexSchema, 0), byteLength: indexSchema })), v.maxLength(4096))),
  accessors: v.optional(v.pipe(v.array(v.object({
    bufferView: v.optional(indexSchema),
    count: v.pipe(indexSchema, v.maxValue(1_000_000)),
    componentType: v.picklist([5120, 5121, 5122, 5123, 5125, 5126]),
    type: v.picklist(['SCALAR', 'VEC2', 'VEC3', 'VEC4', 'MAT2', 'MAT3', 'MAT4']),
    sparse: v.optional(v.object({ count: indexSchema, indices: v.object({ bufferView: indexSchema }), values: v.object({ bufferView: indexSchema }) })),
  })), v.maxLength(4096))),
  nodes: v.optional(v.pipe(v.array(v.object({
    children: v.optional(v.pipe(v.array(indexSchema), v.maxLength(1024))),
    translation: v.optional(vectorSchema(3)),
    rotation: v.optional(vectorSchema(4)),
    scale: v.optional(vectorSchema(3)),
    matrix: v.optional(vectorSchema(16)),
  })), v.maxLength(1024))),
  animations: v.optional(v.pipe(v.array(v.object({
    samplers: v.pipe(v.array(v.object({ input: indexSchema, output: indexSchema, interpolation: v.optional(v.picklist(['LINEAR', 'STEP', 'CUBICSPLINE']), 'LINEAR') })), v.maxLength(4096)),
    channels: v.pipe(v.array(v.object({ sampler: indexSchema, target: v.object({ node: indexSchema, path: v.picklist(['rotation', 'translation', 'scale', 'weights']) }) })), v.maxLength(4096)),
  })), v.maxLength(32))),
  images: v.optional(v.array(v.unknown())),
  meshes: v.optional(v.array(v.unknown())),
  textures: v.optional(v.array(v.unknown())),
})

function validateDecodedSize(document: v.InferOutput<typeof documentSchema>, byteLength: number) {
  const accessors = document.accessors ?? []
  const views = document.bufferViews ?? []
  const nodes = document.nodes ?? []
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 }
  const componentBytes: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
  let decodedBytes = 0
  for (const accessor of accessors) {
    // Sparse and zero-filled accessors can request huge arrays from tiny files.
    decodedBytes += accessor.count * components[accessor.type] * componentBytes[accessor.componentType]
    if (decodedBytes > 64 * 1024 * 1024)
      throw new MotionImportError('size')
    if (accessor.bufferView !== undefined && accessor.bufferView >= views.length)
      throw new MotionImportError('format')
    if (accessor.sparse && (accessor.sparse.count > accessor.count
      || accessor.sparse.indices.bufferView >= views.length || accessor.sparse.values.bufferView >= views.length)) {
      throw new MotionImportError('format')
    }
  }
  for (const view of views) {
    if (view.buffer !== 0 || view.byteOffset + view.byteLength > byteLength)
      throw new MotionImportError('format')
  }
  const visiting = new Set<number>()
  const visited = new Set<number>()
  function visit(index: number, depth: number) {
    if (index >= nodes.length || depth > 128 || visiting.has(index))
      throw new MotionImportError('format')
    if (visited.has(index))
      return
    visiting.add(index)
    for (const child of nodes[index].children ?? [])
      visit(child, depth + 1)
    visiting.delete(index)
    visited.add(index)
  }
  for (let index = 0; index < nodes.length; index++)
    visit(index, 0)
  const mappedNodes = new Set<number>()
  for (const bone of Object.values(document.extensions.VRMC_vrm_animation.humanoid?.humanBones ?? {})) {
    if (bone.node >= nodes.length || mappedNodes.has(bone.node))
      throw new MotionImportError('format')
    mappedNodes.add(bone.node)
  }
  let channelCount = 0
  let channelBytes = 0
  for (const animation of document.animations ?? []) {
    channelCount += animation.channels.length
    if (channelCount > 4096)
      throw new MotionImportError('size')
    for (const sampler of animation.samplers) {
      // The VRMA retargeter rebuilds quaternion tracks with linear interpolation.
      if (sampler.interpolation !== 'LINEAR')
        throw new MotionImportError('interpolation')
      if (sampler.input >= accessors.length || sampler.output >= accessors.length)
        throw new MotionImportError('format')
    }
    const targets = new Set<string>()
    for (const channel of animation.channels) {
      if (channel.sampler >= animation.samplers.length || channel.target.node >= nodes.length)
        throw new MotionImportError('format')
      const target = `${channel.target.node}:${channel.target.path}`
      if (targets.has(target))
        throw new MotionImportError('format')
      targets.add(target)
      const sampler = animation.samplers[channel.sampler]
      // Reused accessors still create separate keyframe arrays for every channel and animation.
      for (const index of [sampler.input, sampler.output]) {
        const accessor = accessors[index]
        channelBytes += accessor.count * components[accessor.type] * Math.max(4, componentBytes[accessor.componentType])
      }
      if (channelBytes > 32 * 1024 * 1024)
        throw new MotionImportError('size')
    }
  }
}

/** Checks a self-contained animation before GLTFLoader can request any external resource. */
export function validateMotionBytes(bytes: ArrayBuffer): void {
  if (bytes.byteLength === 0 || bytes.byteLength > 16 * 1024 * 1024)
    throw new MotionImportError('size')
  const header = new DataView(bytes)
  if (bytes.byteLength < 20 || header.getUint32(0, true) !== 0x46546C67
    || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== bytes.byteLength
    || header.getUint32(16, true) !== 0x4E4F534A) {
    throw new MotionImportError('format')
  }
  const length = header.getUint32(12, true)
  if (length === 0 || length > bytes.byteLength - 20)
    throw new MotionImportError('format')
  let json: unknown
  try {
    json = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, length)))
  }
  catch {
    throw new MotionImportError('format')
  }
  const parsed = v.safeParse(documentSchema, json)
  if (!parsed.success)
    throw new MotionImportError('format')
  const document = parsed.output
  validateDecodedSize(document, bytes.byteLength)
  // Imported files contain motion data only. Models and textures have their own importer.
  if (document.images?.length || document.meshes?.length || document.textures?.length)
    throw new MotionImportError('animation')
  if (document.buffers?.some(buffer => buffer.uri !== undefined))
    throw new MotionImportError('external')
  if (document.buffers?.some(buffer => !Number.isFinite(buffer.byteLength) || buffer.byteLength < 0 || buffer.byteLength > bytes.byteLength))
    throw new MotionImportError('size')
}

/** Parses only local embedded data. The controller discards face tracks and bounds hips travel after retargeting. */
export async function readMotionAnimation(bytes: ArrayBuffer) {
  validateMotionBytes(bytes)
  const loader = new GLTFLoader()
  loader.register(parser => new VRMAnimationLoaderPlugin(parser))
  const gltf = await loader.parseAsync(bytes, '')
  const animations: unknown = gltf.userData.vrmAnimations
  const animation: unknown = Array.isArray(animations) ? animations[0] : undefined
  if (!(animation instanceof VRMAnimation) || !Number.isFinite(animation.duration) || animation.duration <= 0 || animation.duration > 600)
    throw new MotionImportError('animation')
  if (!animation.humanoidTracks.rotation.size && !animation.humanoidTracks.translation.size)
    throw new MotionImportError('animation')
  return animation
}

/** Retargets an imported clip when its avatar first plays it. */
export async function loadMotionClip(bytes: ArrayBuffer, vrm: VRMCore, signal: AbortSignal) {
  signal.throwIfAborted()
  const animation = await readMotionAnimation(bytes)
  signal.throwIfAborted()
  return createVRMAnimationClip(animation, vrm)
}

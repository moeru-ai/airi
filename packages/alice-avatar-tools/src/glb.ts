import { Buffer } from 'node:buffer'

/** The parts of the glTF JSON that the converter reads or writes. Other fields pass through unchanged. */
export interface GltfNode {
  name?: string
  children?: number[]
  mesh?: number
  skin?: number
  rotation?: [number, number, number, number]
  translation?: [number, number, number]
  scale?: [number, number, number]
  matrix?: number[]
  extensions?: Record<string, unknown>
}

export interface GltfAccessor {
  bufferView?: number
  byteOffset?: number
  componentType: number
  count: number
  type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT4'
  normalized?: boolean
  min?: number[]
  max?: number[]
  sparse?: unknown
}

export interface GltfPrimitive {
  attributes: Record<string, number>
  targets?: Array<Record<string, number>>
}

export interface GltfJson {
  asset: Record<string, unknown>
  extensionsUsed?: string[]
  extensions?: Record<string, unknown>
  nodes: GltfNode[]
  meshes: Array<{ name?: string, primitives: GltfPrimitive[], extras?: { targetNames?: string[] } }>
  skins?: Array<{ joints: number[], inverseBindMatrices?: number, skeleton?: number }>
  accessors: GltfAccessor[]
  bufferViews: Array<{ buffer: number, byteOffset?: number, byteLength: number, byteStride?: number }>
  buffers: Array<{ byteLength: number, uri?: string }>
  scenes?: Array<{ nodes: number[] }>
  scene?: number
  [key: string]: unknown
}

export interface Glb {
  json: GltfJson
  /** The binary chunk. The converter edits it in place. */
  bin: Buffer
}

const magic = 0x46546C67
const jsonChunk = 0x4E4F534A
const binChunk = 0x004E4942

/** Reads a binary glTF 2.0 file. Throws on a file that is not GLB 2.0 with one JSON and one BIN chunk. */
export function readGlb(data: Uint8Array): Glb {
  const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  if (buffer.readUInt32LE(0) !== magic || buffer.readUInt32LE(4) !== 2)
    throw new Error('Not a glTF 2.0 binary file')
  const jsonLength = buffer.readUInt32LE(12)
  if (buffer.readUInt32LE(16) !== jsonChunk)
    throw new Error('The first GLB chunk is not JSON')
  const json = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8')) as GltfJson
  const binStart = 20 + jsonLength
  if (binStart + 8 > buffer.length || buffer.readUInt32LE(binStart + 4) !== binChunk)
    throw new Error('The GLB has no BIN chunk')
  const binLength = buffer.readUInt32LE(binStart)
  const bin = Buffer.from(buffer.subarray(binStart + 8, binStart + 8 + binLength))
  return { json, bin }
}

function pad(data: Buffer, fill: number) {
  const padding = (4 - (data.length % 4)) % 4
  return padding === 0 ? data : Buffer.concat([data, Buffer.alloc(padding, fill)])
}

/** Writes a binary glTF 2.0 file. The JSON chunk is padded with spaces and the BIN chunk with zeros, as the spec requires. */
export function writeGlb(glb: Glb): Buffer {
  const json = pad(Buffer.from(JSON.stringify(glb.json), 'utf8'), 0x20)
  const bin = pad(glb.bin, 0)
  const header = Buffer.alloc(12)
  header.writeUInt32LE(magic, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8)
  const jsonHeader = Buffer.alloc(8)
  jsonHeader.writeUInt32LE(json.length, 0)
  jsonHeader.writeUInt32LE(jsonChunk, 4)
  const binHeader = Buffer.alloc(8)
  binHeader.writeUInt32LE(bin.length, 0)
  binHeader.writeUInt32LE(binChunk, 4)
  return Buffer.concat([header, jsonHeader, json, binHeader, bin])
}

const componentSize: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const typeSize: Record<GltfAccessor['type'], number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }

/**
 * A view on the elements of one accessor in the BIN chunk, with interleaving.
 * Reads and writes go to the BIN chunk, so an edit changes the file.
 */
export class AccessorView {
  readonly count: number
  readonly size: number
  private readonly start: number
  private readonly stride: number
  private readonly componentBytes: number

  constructor(private readonly glb: Glb, readonly index: number) {
    const accessor = glb.json.accessors[index]
    if (accessor.sparse !== undefined || accessor.bufferView === undefined)
      throw new Error(`Accessor ${index} is sparse or has no buffer view`)
    const view = glb.json.bufferViews[accessor.bufferView]
    if (view.buffer !== 0)
      throw new Error(`Accessor ${index} is not in the GLB buffer`)
    this.componentBytes = componentSize[accessor.componentType]
    this.size = typeSize[accessor.type]
    this.count = accessor.count
    this.start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0)
    this.stride = view.byteStride ?? this.size * this.componentBytes
  }

  private offset(element: number, component: number) {
    return this.start + element * this.stride + component * this.componentBytes
  }

  get(element: number, component: number): number {
    const accessor = this.glb.json.accessors[this.index]
    const at = this.offset(element, component)
    switch (accessor.componentType) {
      case 5126: return this.glb.bin.readFloatLE(at)
      case 5121: return accessor.normalized ? this.glb.bin.readUInt8(at) / 255 : this.glb.bin.readUInt8(at)
      case 5123: return accessor.normalized ? this.glb.bin.readUInt16LE(at) / 65535 : this.glb.bin.readUInt16LE(at)
      case 5125: return this.glb.bin.readUInt32LE(at)
      default: throw new Error(`Component type ${accessor.componentType} is not supported`)
    }
  }

  /** Writes a float component. Only float accessors can be written. */
  set(element: number, component: number, value: number) {
    if (this.glb.json.accessors[this.index].componentType !== 5126)
      throw new Error(`Accessor ${this.index} is not a float accessor`)
    this.glb.bin.writeFloatLE(value, this.offset(element, component))
  }

  /** Recomputes `min` and `max`, which glTF requires for POSITION. */
  updateBounds() {
    const min = Array.from<number>({ length: this.size }).fill(Infinity)
    const max = Array.from<number>({ length: this.size }).fill(-Infinity)
    for (let element = 0; element < this.count; element++) {
      for (let component = 0; component < this.size; component++) {
        const value = this.get(element, component)
        min[component] = Math.min(min[component], value)
        max[component] = Math.max(max[component], value)
      }
    }
    const accessor = this.glb.json.accessors[this.index]
    accessor.min = min
    accessor.max = max
  }
}

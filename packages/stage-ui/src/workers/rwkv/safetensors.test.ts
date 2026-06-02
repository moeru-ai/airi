import { describe, expect, it } from 'vitest'

import { deriveNumLayer, parseSafetensorsHeader, resolveQuantLayerCounts } from './safetensors'

/**
 * Build a minimal but valid `safetensors` buffer from a header object:
 * an 8-byte little-endian u64 header length, the JSON header, then a zeroed
 * data region sized to the largest tensor end offset.
 *
 * @example
 * buildSafetensors({ 'w': { shape: [2], data_offsets: [0, 4] } })
 */
function buildSafetensors(header: Record<string, unknown>): ArrayBuffer {
  const json = new TextEncoder().encode(JSON.stringify(header))
  const dataLength = Object.values(header)
    .map(v => (v as { data_offsets?: [number, number] }).data_offsets?.[1] ?? 0)
    .reduce((max, end) => Math.max(max, end), 0)

  const buffer = new ArrayBuffer(8 + json.byteLength + dataLength)
  const view = new DataView(buffer)
  view.setBigUint64(0, BigInt(json.byteLength), true)
  new Uint8Array(buffer, 8, json.byteLength).set(json)
  return buffer
}

const FIXTURE = {
  '__metadata__': { format: 'pt' },
  'emb.weight': { dtype: 'F16', shape: [10, 4], data_offsets: [0, 80] },
  'blocks.0.att.key.weight': { dtype: 'F16', shape: [4, 4], data_offsets: [80, 112] },
  'blocks.1.att.key.weight': { dtype: 'F16', shape: [4, 4], data_offsets: [112, 144] },
  'head.weight': { dtype: 'F16', shape: [4, 10], data_offsets: [144, 224] },
}

describe('parseSafetensorsHeader', () => {
  /**
   * @example
   * parseSafetensorsHeader(buildSafetensors(FIXTURE)).entries.length // -> 4
   */
  it('returns every tensor entry except __metadata__', () => {
    const { entries } = parseSafetensorsHeader(buildSafetensors(FIXTURE))

    expect(entries).toHaveLength(4)
    expect(entries.map(e => e.name)).not.toContain('__metadata__')
    expect(entries[0]).toEqual({ name: 'emb.weight', shape: [10, 4], start: 0, end: 80 })
  })

  /**
   * @example
   * parseSafetensorsHeader(buf).dataStart // -> 8 + headerByteLength
   */
  it('reports dataStart as 8 + the JSON header byte length', () => {
    const headerBytes = new TextEncoder().encode(JSON.stringify(FIXTURE)).byteLength
    const { dataStart } = parseSafetensorsHeader(buildSafetensors(FIXTURE))

    expect(dataStart).toBe(8 + headerBytes)
  })
})

describe('deriveNumLayer', () => {
  /**
   * @example
   * deriveNumLayer(['blocks.0.x', 'blocks.1.x']) // -> 2
   */
  it('returns max(blocks.{i}) + 1 across tensor names', () => {
    const { entries } = parseSafetensorsHeader(buildSafetensors(FIXTURE))
    expect(deriveNumLayer(entries.map(e => e.name))).toBe(2)
  })

  /**
   * @example
   * deriveNumLayer(['emb.weight', 'head.weight']) // -> 0
   */
  it('returns 0 when there are no block tensors', () => {
    expect(deriveNumLayer(['emb.weight', 'head.weight'])).toBe(0)
  })
})

describe('resolveQuantLayerCounts', () => {
  /**
   * @example
   * resolveQuantLayerCounts('fp16', 24) // -> { int8: 0, nf4: 0, sf4: 0 }
   */
  it('maps fp16 to no quantized layers', () => {
    expect(resolveQuantLayerCounts('fp16', 24)).toEqual({ int8: 0, nf4: 0, sf4: 0 })
  })

  /**
   * @example
   * resolveQuantLayerCounts('int8', 24) // -> { int8: 24, nf4: 0, sf4: 0 }
   */
  it('maps int8 to all layers as Int8', () => {
    expect(resolveQuantLayerCounts('int8', 24)).toEqual({ int8: 24, nf4: 0, sf4: 0 })
  })

  /**
   * @example
   * resolveQuantLayerCounts('nf4', 32) // -> { int8: 0, nf4: 32, sf4: 0 }
   */
  it('maps nf4 to all layers as NF4', () => {
    expect(resolveQuantLayerCounts('nf4', 32)).toEqual({ int8: 0, nf4: 32, sf4: 0 })
  })
})

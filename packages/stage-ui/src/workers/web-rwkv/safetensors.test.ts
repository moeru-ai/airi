import { describe, expect, it } from 'vitest'

import {
  bf16BitsToF16Bits,
  countRwkvLayers,
  f32ToHalfBits,
  loraNumEmbRawAxis,
  orientAdapterMatrix,
  readSafetensorsHeader,
  readSafetensorsHeaderLen,
  toF16Bytes,
} from './safetensors'

describe('f32ToHalfBits', () => {
  it('maps representative values to their IEEE half bit patterns', () => {
    expect(f32ToHalfBits(0)).toBe(0x0000)
    expect(f32ToHalfBits(-0)).toBe(0x8000)
    expect(f32ToHalfBits(1)).toBe(0x3C00)
    expect(f32ToHalfBits(2)).toBe(0x4000)
    expect(f32ToHalfBits(0.5)).toBe(0x3800)
    expect(f32ToHalfBits(-1)).toBe(0xBC00)
    // Largest finite half.
    expect(f32ToHalfBits(65504)).toBe(0x7BFF)
    // Smallest positive normal half (2^-14).
    expect(f32ToHalfBits(2 ** -14)).toBe(0x0400)
  })

  it('saturates out-of-range magnitudes to half infinity', () => {
    expect(f32ToHalfBits(1e30)).toBe(0x7C00)
    expect(f32ToHalfBits(-1e30)).toBe(0xFC00)
  })
})

describe('bf16BitsToF16Bits', () => {
  it('widens bf16 (high 16 bits of f32) then narrows to f16', () => {
    // bf16 0x3F80 == 1.0; bf16 0x4000 == 2.0; bf16 0xBF80 == -1.0.
    expect(bf16BitsToF16Bits(0x3F80)).toBe(0x3C00)
    expect(bf16BitsToF16Bits(0x4000)).toBe(0x4000)
    expect(bf16BitsToF16Bits(0xBF80)).toBe(0xBC00)
    expect(bf16BitsToF16Bits(0x0000)).toBe(0x0000)
  })
})

describe('toF16Bytes', () => {
  it('returns F16 input unchanged (no copy)', () => {
    const src = new Uint8Array([0x00, 0x3C, 0x00, 0x40]) // f16 [1.0, 2.0]
    expect(toF16Bytes(src, 'F16')).toBe(src)
  })

  it('casts BF16 bytes to f16 bytes element-wise', () => {
    // bf16 LE [1.0=0x3F80, 2.0=0x4000] -> f16 LE [0x3C00, 0x4000]
    const src = new Uint8Array([0x80, 0x3F, 0x00, 0x40])
    const out = new Uint16Array(toF16Bytes(src, 'BF16').buffer)
    expect(Array.from(out)).toEqual([0x3C00, 0x4000])
  })

  it('casts F32 bytes to f16 bytes element-wise', () => {
    // f32 LE [1.0] -> f16 0x3C00
    const src = new Uint8Array(new Float32Array([1, -1]).buffer)
    const out = new Uint16Array(toF16Bytes(src, 'F32').buffer)
    expect(Array.from(out)).toEqual([0x3C00, 0xBC00])
  })

  it('throws on an unsupported dtype', () => {
    expect(() => toF16Bytes(new Uint8Array(4), 'I32')).toThrow(/unsupported safetensors dtype/)
  })
})

describe('readSafetensorsHeader', () => {
  /** Build a safetensors prefix (8-byte len + JSON header) for the given header object. */
  function makeHeader(headerObj: Record<string, unknown>): Uint8Array {
    const json = new TextEncoder().encode(JSON.stringify(headerObj))
    const out = new Uint8Array(8 + json.length)
    new DataView(out.buffer).setBigUint64(0, BigInt(json.length), true)
    out.set(json, 8)
    return out
  }

  it('parses tensor entries and the data-block start, dropping __metadata__', () => {
    const head = makeHeader({
      '__metadata__': { format: 'pt' },
      'emb.weight': { dtype: 'BF16', shape: [4, 2], data_offsets: [0, 16] },
      'blocks.0.att.key.weight': { dtype: 'BF16', shape: [2, 2], data_offsets: [16, 24] },
    })

    const parsed = readSafetensorsHeader(head)

    expect(parsed.tensors.__metadata__).toBeUndefined()
    expect(parsed.tensors['emb.weight'].dtype).toBe('BF16')
    expect(parsed.tensors['emb.weight'].shape).toEqual([4, 2])
    expect(parsed.tensors['emb.weight'].data_offsets).toEqual([0, 16])
    expect(parsed.dataStart).toBe(head.byteLength)
  })

  it('throws when the buffer does not cover the full header', () => {
    const head = makeHeader({ 'emb.weight': { dtype: 'F16', shape: [1], data_offsets: [0, 2] } })
    expect(() => readSafetensorsHeader(head.subarray(0, head.byteLength - 4))).toThrow(/exceeds the provided buffer/)
  })

  // ROOT CAUSE:
  //
  // When a model URL resolved to an HTML error/login page, the first 8 bytes
  // ("<!doctyp") were read as the little-endian u64 header length — an ~8e18
  // value — and the loader attempted a multi-exabyte read before failing with a
  // confusing "exceeds the provided buffer" message.
  //
  // We fixed this by bounding the header length (2 ≤ len ≤ 100 MB) in
  // readSafetensorsHeaderLen, which both readSafetensorsHeader and the streaming
  // path now use, so a non-safetensors body is rejected early and clearly.
  it('rejects an HTML page whose first bytes would parse as a giant header length', () => {
    const html = new TextEncoder().encode('<!doctype html><html><head><title>404</title></head></html>')
    expect(() => readSafetensorsHeader(html)).toThrow(/implausible safetensors header length/)
  })
})

describe('readSafetensorsHeaderLen', () => {
  /** Encode an 8-byte little-endian u64 length prefix. */
  function prefix(len: bigint): Uint8Array {
    const out = new Uint8Array(8)
    new DataView(out.buffer).setBigUint64(0, len, true)
    return out
  }

  it('returns the encoded length for a plausible header', () => {
    expect(readSafetensorsHeaderLen(prefix(64n))).toBe(64)
    expect(readSafetensorsHeaderLen(prefix(2n))).toBe(2)
    expect(readSafetensorsHeaderLen(prefix(100_000_000n))).toBe(100_000_000)
  })

  it('throws when there are fewer than 8 bytes', () => {
    expect(() => readSafetensorsHeaderLen(new Uint8Array(4))).toThrow(/too short/)
  })

  it('throws on a zero/too-small length', () => {
    expect(() => readSafetensorsHeaderLen(prefix(0n))).toThrow(/implausible/)
    expect(() => readSafetensorsHeaderLen(prefix(1n))).toThrow(/implausible/)
  })

  it('throws on a length past the 100 MB cap (e.g. ASCII bytes read as a u64)', () => {
    expect(() => readSafetensorsHeaderLen(prefix(100_000_001n))).toThrow(/implausible/)
    // "<!doctyp" little-endian — what an HTML body's first 8 bytes decode to.
    expect(() => readSafetensorsHeaderLen(new TextEncoder().encode('<!doctyp'))).toThrow(/implausible/)
  })
})

describe('loraNumEmbRawAxis', () => {
  it('puts num_emb on the last axis for v7 down-projections', () => {
    expect(loraNumEmbRawAxis('blocks.0.att.w1', 2)).toBe(1)
    expect(loraNumEmbRawAxis('blocks.0.att.a1', 2)).toBe(1)
    expect(loraNumEmbRawAxis('blocks.0.att.g1', 2)).toBe(1)
    expect(loraNumEmbRawAxis('blocks.0.att.v1', 2)).toBe(1)
  })

  it('puts num_emb on the second-to-last axis for v7 up-projections', () => {
    expect(loraNumEmbRawAxis('blocks.0.att.w2', 2)).toBe(0)
    expect(loraNumEmbRawAxis('blocks.0.att.a2', 2)).toBe(0)
    expect(loraNumEmbRawAxis('blocks.0.att.g2', 2)).toBe(0)
    expect(loraNumEmbRawAxis('blocks.0.att.v2', 2)).toBe(0)
  })

  it('matches the v6 time-mix / time-decay adapters by full suffix', () => {
    expect(loraNumEmbRawAxis('blocks.0.att.time_mix_w1', 2)).toBe(1)
    expect(loraNumEmbRawAxis('blocks.0.att.time_decay_w1', 2)).toBe(1)
    // time_mix_w2 is 3D ([5, …, …]); num_emb sits on the second-to-last axis.
    expect(loraNumEmbRawAxis('blocks.0.att.time_mix_w2', 3)).toBe(1)
    expect(loraNumEmbRawAxis('blocks.0.att.time_decay_w2', 2)).toBe(0)
  })

  it('returns null for non-adapter tensors and < 2D tensors', () => {
    expect(loraNumEmbRawAxis('blocks.0.att.key.weight', 2)).toBeNull()
    expect(loraNumEmbRawAxis('emb.weight', 2)).toBeNull()
    // The dot-anchored .w1 match must not catch the full-suffix v6 names by accident.
    expect(loraNumEmbRawAxis('blocks.0.att.w1', 1)).toBeNull()
  })
})

describe('orientAdapterMatrix', () => {
  /** f16 byte stream where element k carries the low byte k (high byte 0) for easy tracing. */
  function indexedF16(count: number): Uint8Array {
    const out = new Uint8Array(count * 2)
    for (let k = 0; k < count; k++)
      out[k * 2] = k
    return out
  }

  /** The low byte of each f16 element, i.e. the per-element index encoded by indexedF16. */
  function lowBytes(data: Uint8Array): number[] {
    const out: number[] = []
    for (let i = 0; i < data.byteLength; i += 2)
      out.push(data[i])
    return out
  }

  it('leaves a converted down-projection (num_emb on the last axis) untouched', () => {
    const data = indexedF16(6)
    // Converted w1 is (rank=2, num_emb=3) -> num_emb already on the last axis.
    const out = orientAdapterMatrix('blocks.0.att.w1', data, [2, 3], 3)
    expect(out.data).toBe(data)
    expect(out.shape).toEqual([2, 3])
  })

  it('transposes a raw-HF down-projection so num_emb lands on the last axis', () => {
    const data = indexedF16(6)
    // Raw-HF w1 is (num_emb=3, rank=2); transpose -> (rank=2, num_emb=3).
    const out = orientAdapterMatrix('blocks.0.att.w1', data, [3, 2], 3)
    expect(out.shape).toEqual([2, 3])
    // 3x2 row-major [[0,1],[2,3],[4,5]] transposed to 2x3 [[0,2,4],[1,3,5]].
    expect(lowBytes(out.data)).toEqual([0, 2, 4, 1, 3, 5])
  })

  it('transposes a raw-HF up-projection (num_emb on the second-to-last axis)', () => {
    const data = indexedF16(6)
    // Raw-HF w2 is (rank=3, num_emb=2); num_emb must sit on axis 0 -> transpose.
    const out = orientAdapterMatrix('blocks.0.att.w2', data, [3, 2], 2)
    expect(out.shape).toEqual([2, 3])
    expect(lowBytes(out.data)).toEqual([0, 2, 4, 1, 3, 5])
  })

  it('transposes only the inner two axes of a 3D v6 time_mix_w2', () => {
    const data = indexedF16(8)
    // [outer=2, 2, 2]; num_emb (99) is on neither inner axis -> transpose each slice.
    const out = orientAdapterMatrix('blocks.0.att.time_mix_w2', data, [2, 2, 2], 99)
    expect(out.shape).toEqual([2, 2, 2])
    // Per 2x2 slice, element (i,j) -> (j,i): [0,1,2,3] -> [0,2,1,3]; [4,5,6,7] -> [4,6,5,7].
    expect(lowBytes(out.data)).toEqual([0, 2, 1, 3, 4, 6, 5, 7])
  })

  it('leaves non-adapter tensors untouched', () => {
    const data = indexedF16(6)
    const out = orientAdapterMatrix('blocks.0.att.key.weight', data, [3, 2], 3)
    expect(out.data).toBe(data)
    expect(out.shape).toEqual([3, 2])
  })

  it('disables reorientation when num_emb is non-finite', () => {
    const data = indexedF16(6)
    const out = orientAdapterMatrix('blocks.0.att.w1', data, [3, 2], Number.NaN)
    expect(out.data).toBe(data)
    expect(out.shape).toEqual([3, 2])
  })
})

describe('countRwkvLayers', () => {
  it('counts layers from the highest blocks.<n> index', () => {
    const tensors = {
      'emb.weight': { dtype: 'F16', shape: [1], data_offsets: [0, 2] as [number, number] },
      'blocks.0.att.key.weight': { dtype: 'F16', shape: [1], data_offsets: [2, 4] as [number, number] },
      'blocks.2.ffn.key.weight': { dtype: 'F16', shape: [1], data_offsets: [4, 6] as [number, number] },
    }
    expect(countRwkvLayers(tensors)).toBe(3)
  })

  it('returns 0 when there are no block tensors', () => {
    expect(countRwkvLayers({ 'head.weight': { dtype: 'F16', shape: [1], data_offsets: [0, 2] } })).toBe(0)
  })
})

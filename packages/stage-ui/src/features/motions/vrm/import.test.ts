import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import { readMotionAnimation, validateMotionBytes } from './import'

function documentBytes(patch: Record<string, unknown> = {}) {
  const json = JSON.stringify({
    asset: { version: '2.0' },
    extensions: { VRMC_vrm_animation: { specVersion: '1.0' } },
    ...patch,
  })
  const encoded = new TextEncoder().encode(json.padEnd(Math.ceil(json.length / 4) * 4))
  const bytes = new ArrayBuffer(20 + encoded.byteLength)
  const view = new DataView(bytes)
  view.setUint32(0, 0x46546C67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, bytes.byteLength, true)
  view.setUint32(12, encoded.byteLength, true)
  view.setUint32(16, 0x4E4F534A, true)
  new Uint8Array(bytes, 20).set(encoded)
  return bytes
}

describe('local VRMA imports', () => {
  it('rejects external buffer references before invoking a loader', () => {
    expect(() => validateMotionBytes(documentBytes({ buffers: [{ byteLength: 10, uri: 'https://example.com/track.bin' }] }))).toThrow('external')
    expect(() => validateMotionBytes(documentBytes({ buffers: [{ byteLength: 10, uri: 'file:///private/track.bin' }] }))).toThrow('external')
    expect(() => validateMotionBytes(documentBytes({ buffers: [{ byteLength: 10, uri: 'data:application/octet-stream;base64,AAAA' }] }))).toThrow('external')
  })

  it('rejects model or image payloads and invalid lengths', () => {
    expect(() => validateMotionBytes(documentBytes({ images: [{ uri: 'https://example.com/pixel' }] }))).toThrow('animation')
    expect(() => validateMotionBytes(documentBytes({ meshes: [{}] }))).toThrow('animation')
    expect(() => validateMotionBytes(new ArrayBuffer(0))).toThrow('size')
    expect(() => validateMotionBytes(new ArrayBuffer(17 * 1024 * 1024))).toThrow('size')
    const bytes = documentBytes()
    new DataView(bytes).setUint32(12, 0xFFFFFFFF, true)
    expect(() => validateMotionBytes(bytes)).toThrow('format')
  })

  it('rejects an ordinary model without the VRMA extension', () => {
    expect(() => validateMotionBytes(documentBytes({ extensions: {} }))).toThrow('format')
  })

  it('rejects tiny allocation bombs and cyclic node graphs before parsing', () => {
    expect(() => validateMotionBytes(documentBytes({ accessors: [{ componentType: 5126, type: 'MAT4', count: 500_000_000 }] }))).toThrow('format')
    const accessor = { componentType: 5126, type: 'MAT4', count: 1_000_000 }
    expect(() => validateMotionBytes(documentBytes({ accessors: [accessor, accessor] }))).toThrow('size')
    expect(() => validateMotionBytes(documentBytes({ nodes: [{ children: [1] }, { children: [0] }] }))).toThrow('format')
    expect(() => validateMotionBytes(documentBytes({ nodes: [{ children: [1000] }] }))).toThrow('format')
    const samplers = [{ input: 0, output: 1 }]
    const channels = Array.from({ length: 8 }, (_, node) => ({ sampler: 0, target: { node, path: 'rotation' } }))
    expect(() => validateMotionBytes(documentBytes({
      accessors: [{ componentType: 5126, type: 'SCALAR', count: 1_000_000 }, { componentType: 5126, type: 'VEC4', count: 1_000_000 }],
      nodes: Array.from({ length: 8 }, () => ({})),
      animations: [{ samplers, channels }],
    }))).toThrow('size')
  })

  it('rejects unsupported interpolation before it enters the library', () => {
    for (const interpolation of ['STEP', 'CUBICSPLINE']) {
      expect(() => validateMotionBytes(documentBytes({
        accessors: [{ componentType: 5126, type: 'SCALAR', count: 2 }, { componentType: 5126, type: 'VEC4', count: 6 }],
        nodes: [{}],
        animations: [{ samplers: [{ input: 0, output: 1, interpolation }], channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }] }],
      }))).toThrow('interpolation')
    }
  })

  it('decodes the original relaxed idle as a self-contained 48-second VRMA', async () => {
    const file = await readFile(new URL('./relaxed-idle.vrma', import.meta.url))
    const bytes = new Uint8Array(file).buffer
    const animation = await readMotionAnimation(bytes)
    expect(animation.duration).toBe(48)
    expect(animation.humanoidTracks.rotation.size).toBeGreaterThan(20)
    expect(animation.expressionTracks.preset.size).toBe(0)
    expect(animation.expressionTracks.custom.size).toBe(0)
    expect(animation.lookAtTrack).toBeNull()
  })
})

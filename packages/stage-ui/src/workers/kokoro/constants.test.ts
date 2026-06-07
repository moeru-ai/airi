import type { WebGPUCapabilities } from '@proj-airi/stage-shared/webgpu'

import { describe, expect, it } from 'vitest'

import { getDefaultKokoroModel, kokoroModelsToModelInfo } from './constants'

/**
 * Build a full `WebGPUCapabilities` object for tests. Defaults to a fully
 * capable WebGPU device; override fields to model partial support.
 */
function caps(over: Partial<WebGPUCapabilities> = {}): WebGPUCapabilities {
  return {
    supported: true,
    fp16Supported: true,
    estimatedVRAM: 0,
    estimatedVRAMSource: 'none',
    adapterInfo: null,
    reason: '',
    ...over,
  }
}

function modelIds(capabilities: WebGPUCapabilities | null): string[] {
  return kokoroModelsToModelInfo(capabilities).map(m => m.id)
}

describe('kokoroModelsToModelInfo', () => {
  it('should offer every WebGPU quantization on a fully capable device', () => {
    const ids = modelIds(caps())

    expect(ids).toContain('fp16-webgpu')
    expect(ids).toContain('fp32-webgpu')
    expect(ids).toContain('q8-webgpu')
    expect(ids).toContain('q4-webgpu')
  })

  it('should order each platform group from lightest (q4) to full precision (fp32)', () => {
    const ids = modelIds(caps())

    // WebGPU group, then WASM group; lightest → heaviest within each.
    expect(ids).toEqual([
      'q4-webgpu',
      'q8-webgpu',
      'fp16-webgpu',
      'fp32-webgpu',
      'q4',
      'q4f16',
      'q8',
      'fp16',
      'fp32',
    ])
  })

  it('should drop all WebGPU models when WebGPU is unsupported', () => {
    const ids = modelIds(caps({ supported: false, fp16Supported: false }))

    expect(ids).not.toContain('fp16-webgpu')
    expect(ids).not.toContain('fp32-webgpu')
    expect(ids).not.toContain('q8-webgpu')
    expect(ids).not.toContain('q4-webgpu')
    // WASM models are always available.
    expect(ids).toContain('q8')
    expect(ids).toContain('q4')
    expect(ids).toContain('q4f16')
  })

  it('should offer q8/q4 WebGPU even when fp16 is unsupported', () => {
    // int8 / int4 need only baseline WebGPU compute, so they stay available on a
    // device that lacks `shader-f16` (which only gates fp16-webgpu).
    const ids = modelIds(caps({ fp16Supported: false }))

    expect(ids).not.toContain('fp16-webgpu')
    expect(ids).toContain('fp32-webgpu')
    expect(ids).toContain('q8-webgpu')
    expect(ids).toContain('q4-webgpu')
  })

  it('should translate description keys when a translator is provided', () => {
    const models = kokoroModelsToModelInfo(caps(), key => `t:${key}`)
    const q8 = models.find(m => m.id === 'q8-webgpu')

    expect(q8?.description).toBe('t:settings.pages.providers.provider.kokoro-local.models.q8-webgpu.description')
  })
})

describe('getDefaultKokoroModel', () => {
  it('should default to fp16-webgpu when WebGPU and shader-f16 are supported', () => {
    expect(getDefaultKokoroModel(caps())).toBe('fp16-webgpu')
  })

  it('should default to fp32-webgpu on WebGPU without shader-f16 support', () => {
    expect(getDefaultKokoroModel(caps({ fp16Supported: false }))).toBe('fp32-webgpu')
  })

  it('should fall back to q4f16 (WASM) when WebGPU is unsupported', () => {
    expect(getDefaultKokoroModel(caps({ supported: false }))).toBe('q4f16')
  })
})

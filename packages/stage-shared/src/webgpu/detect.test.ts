import { check as gpuuCheck } from 'gpuu/webgpu'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  detectWebGPU,
  getCachedWebGPUCapabilities,
  getEstimatedVRAMOverride,
  resetWebGPUCache,
  setEstimatedVRAMOverride,
} from './detect'

// Mock gpuu/webgpu before importing detect.ts
vi.mock('gpuu/webgpu', () => ({
  check: vi.fn(),
  isWebGPUSupported: vi.fn(),
}))

const mockedCheck = vi.mocked(gpuuCheck)

interface MockAdapterInfo {
  vendor?: string
  architecture?: string
  device?: string
  description?: string
}

/**
 * Build a minimal mock GPUAdapter for tests.
 * `maxBufferSize` drives the heuristic VRAM calculation.
 * `info` optionally populates adapterInfo.
 */
function makeMockAdapter(options: {
  maxBufferSize?: number
  info?: MockAdapterInfo
}): any {
  const adapter: { limits: { maxBufferSize: number }, info?: MockAdapterInfo } = {
    limits: { maxBufferSize: options.maxBufferSize ?? 0 },
  }
  if (options.info)
    adapter.info = options.info
  return adapter
}

describe('detectWebGPU', () => {
  beforeEach(() => {
    resetWebGPUCache()
    setEstimatedVRAMOverride(null)
  })

  afterEach(() => {
    resetWebGPUCache()
    setEstimatedVRAMOverride(null)
    vi.clearAllMocks()
  })

  it('should derive VRAM from the maxBufferSize * 4 heuristic', async () => {
    mockedCheck.mockResolvedValue({
      supported: true,
      fp16Supported: true,
      isNode: false,
      reason: '',
      adapter: makeMockAdapter({ maxBufferSize: 256 * 1024 * 1024 }),
    })

    const result = await detectWebGPU()

    expect(result.supported).toBe(true)
    expect(result.fp16Supported).toBe(true)
    expect(result.estimatedVRAM).toBe(256 * 1024 * 1024 * 4)
    expect(result.estimatedVRAMSource).toBe('max-buffer-heuristic')
  })

  it('should report "none" when the adapter has no maxBufferSize', async () => {
    mockedCheck.mockResolvedValue({
      supported: true,
      fp16Supported: false,
      isNode: false,
      reason: '',
      adapter: makeMockAdapter({ maxBufferSize: 0 }),
    })

    const result = await detectWebGPU()

    expect(result.estimatedVRAM).toBe(0)
    expect(result.estimatedVRAMSource).toBe('none')
  })

  it('should report "none" when WebGPU is unsupported', async () => {
    mockedCheck.mockResolvedValue({
      supported: false,
      fp16Supported: false,
      isNode: false,
      reason: 'not available',
    })

    const result = await detectWebGPU()

    expect(result.supported).toBe(false)
    expect(result.estimatedVRAM).toBe(0)
    expect(result.estimatedVRAMSource).toBe('none')
    expect(result.reason).toBe('not available')
  })

  it('should extract adapter.info when available', async () => {
    mockedCheck.mockResolvedValue({
      supported: true,
      fp16Supported: true,
      isNode: false,
      reason: '',
      adapter: makeMockAdapter({
        maxBufferSize: 1024 * 1024 * 1024,
        info: {
          vendor: 'apple',
          architecture: 'apple-m1',
          device: 'Apple M1',
          description: 'Apple GPU',
        },
      }),
    })

    const result = await detectWebGPU()

    expect(result.adapterInfo).toEqual({
      vendor: 'apple',
      architecture: 'apple-m1',
      device: 'Apple M1',
      description: 'Apple GPU',
    })
  })

  it('should handle adapter.info with missing fields gracefully', async () => {
    mockedCheck.mockResolvedValue({
      supported: true,
      fp16Supported: true,
      isNode: false,
      reason: '',
      adapter: makeMockAdapter({
        maxBufferSize: 1024 * 1024 * 1024,
        info: { vendor: 'nvidia' }, // only vendor set
      }),
    })

    const result = await detectWebGPU()

    expect(result.adapterInfo).toEqual({
      vendor: 'nvidia',
      architecture: '',
      device: '',
      description: '',
    })
  })

  it('should set adapterInfo to null when adapter.info is not exposed', async () => {
    mockedCheck.mockResolvedValue({
      supported: true,
      fp16Supported: true,
      isNode: false,
      reason: '',
      adapter: makeMockAdapter({ maxBufferSize: 512 * 1024 * 1024 }),
    })

    const result = await detectWebGPU()

    expect(result.adapterInfo).toBeNull()
  })

  it('should fall back to requestAdapterInfo() when adapter.info is absent', async () => {
    const legacyInfo: MockAdapterInfo = {
      vendor: 'intel',
      architecture: 'xe',
      device: 'Iris Xe',
      description: 'Intel Xe Graphics',
    }

    const legacyAdapter: any = {
      limits: { maxBufferSize: 256 * 1024 * 1024 },
      requestAdapterInfo: vi.fn(async () => legacyInfo),
    }

    mockedCheck.mockResolvedValue({
      supported: true,
      fp16Supported: false,
      isNode: false,
      reason: '',
      adapter: legacyAdapter,
    })

    const result = await detectWebGPU()

    expect(result.adapterInfo).toEqual({
      vendor: 'intel',
      architecture: 'xe',
      device: 'Iris Xe',
      description: 'Intel Xe Graphics',
    })
  })

  it('should cache the detection result across calls', async () => {
    mockedCheck.mockResolvedValue({
      supported: true,
      fp16Supported: true,
      isNode: false,
      reason: '',
      adapter: makeMockAdapter({ maxBufferSize: 1024 * 1024 }),
    })

    const first = await detectWebGPU()
    const second = await detectWebGPU()

    expect(first).toBe(second)
    expect(mockedCheck).toHaveBeenCalledTimes(1)
  })

  it('should deduplicate concurrent calls', async () => {
    mockedCheck.mockResolvedValue({
      supported: true,
      fp16Supported: true,
      isNode: false,
      reason: '',
      adapter: makeMockAdapter({ maxBufferSize: 1024 * 1024 }),
    })

    const [a, b] = await Promise.all([detectWebGPU(), detectWebGPU()])

    expect(a).toBe(b)
    expect(mockedCheck).toHaveBeenCalledTimes(1)
  })

  it('should produce a safe fallback when gpuu throws', async () => {
    mockedCheck.mockRejectedValue(new Error('internal'))

    const result = await detectWebGPU()

    expect(result.supported).toBe(false)
    expect(result.estimatedVRAM).toBe(0)
    expect(result.estimatedVRAMSource).toBe('none')
    expect(result.adapterInfo).toBeNull()
    expect(result.reason).toBe('Detection threw an exception')
  })
})

describe('vRAM override', () => {
  beforeEach(() => {
    resetWebGPUCache()
    setEstimatedVRAMOverride(null)
  })

  afterEach(() => {
    resetWebGPUCache()
    setEstimatedVRAMOverride(null)
    vi.clearAllMocks()
  })

  it('should apply the override when detection runs', async () => {
    mockedCheck.mockResolvedValue({
      supported: true,
      fp16Supported: true,
      isNode: false,
      reason: '',
      adapter: makeMockAdapter({ maxBufferSize: 128 * 1024 * 1024 }),
    })

    setEstimatedVRAMOverride(8 * 1024 * 1024 * 1024) // 8 GB

    const result = await detectWebGPU()

    expect(result.estimatedVRAM).toBe(8 * 1024 * 1024 * 1024)
    expect(result.estimatedVRAMSource).toBe('override')
  })

  it('should update cached result in-place when override is set after detection', async () => {
    mockedCheck.mockResolvedValue({
      supported: true,
      fp16Supported: true,
      isNode: false,
      reason: '',
      adapter: makeMockAdapter({ maxBufferSize: 128 * 1024 * 1024 }),
    })

    await detectWebGPU()
    expect(getCachedWebGPUCapabilities()?.estimatedVRAMSource).toBe('max-buffer-heuristic')

    setEstimatedVRAMOverride(4 * 1024 * 1024 * 1024)

    expect(getCachedWebGPUCapabilities()?.estimatedVRAM).toBe(4 * 1024 * 1024 * 1024)
    expect(getCachedWebGPUCapabilities()?.estimatedVRAMSource).toBe('override')
  })

  it('should revert to heuristic when override is cleared with null', async () => {
    mockedCheck.mockResolvedValue({
      supported: true,
      fp16Supported: true,
      isNode: false,
      reason: '',
      adapter: makeMockAdapter({ maxBufferSize: 128 * 1024 * 1024 }),
    })

    await detectWebGPU()
    setEstimatedVRAMOverride(4 * 1024 * 1024 * 1024)
    expect(getCachedWebGPUCapabilities()?.estimatedVRAMSource).toBe('override')

    setEstimatedVRAMOverride(null)

    expect(getCachedWebGPUCapabilities()?.estimatedVRAM).toBe(128 * 1024 * 1024 * 4)
    expect(getCachedWebGPUCapabilities()?.estimatedVRAMSource).toBe('max-buffer-heuristic')
  })

  it('should expose the current override via getEstimatedVRAMOverride()', () => {
    expect(getEstimatedVRAMOverride()).toBeNull()
    setEstimatedVRAMOverride(2 * 1024 * 1024 * 1024)
    expect(getEstimatedVRAMOverride()).toBe(2 * 1024 * 1024 * 1024)
  })

  it('should reject invalid override values', () => {
    expect(() => setEstimatedVRAMOverride(-1)).toThrow()
    expect(() => setEstimatedVRAMOverride(Number.NaN)).toThrow()
    expect(() => setEstimatedVRAMOverride(Number.POSITIVE_INFINITY)).toThrow()
  })

  it('should accept zero as a no-op override (reverts to heuristic)', async () => {
    mockedCheck.mockResolvedValue({
      supported: true,
      fp16Supported: true,
      isNode: false,
      reason: '',
      adapter: makeMockAdapter({ maxBufferSize: 128 * 1024 * 1024 }),
    })

    setEstimatedVRAMOverride(0)
    const result = await detectWebGPU()

    // Zero is considered "no override" for the purpose of estimation
    expect(result.estimatedVRAMSource).toBe('max-buffer-heuristic')
  })
})

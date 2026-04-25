import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock Worker globally since it's not available in Node
class MockWorker {
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
  postMessage = vi.fn()
  terminate = vi.fn()
}
vi.stubGlobal('Worker', MockWorker)

// Mock dependencies that require browser APIs or Vue
vi.mock('../../../composables/use-inference-status', () => ({
  updateInferenceStatus: vi.fn(),
  removeInferenceStatus: vi.fn(),
}))

const recordDeviceLoss = vi.fn()
vi.mock('../coordinator', () => ({
  getGPUCoordinator: () => ({
    requestAllocation: vi.fn(() => ({ modelId: 'test', estimatedBytes: 0 })),
    release: vi.fn(),
    touch: vi.fn(),
    recordDeviceLoss,
  }),
  getLoadQueue: () => ({
    enqueue: vi.fn((_id: string, _p: number, loader: () => Promise<unknown>) => loader()),
  }),
  MODEL_VRAM_ESTIMATES: {},
}))

vi.mock('@proj-airi/stage-shared', () => ({
  defaultPerfTracer: {
    withMeasure: vi.fn((_cat: string, _name: string, fn: () => unknown) => fn()),
  },
}))

describe('kokoro adapter - singleton recovery', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should create adapter with idle state', async () => {
    const { createKokoroAdapter } = await import('./kokoro')
    const adapter = createKokoroAdapter()
    expect(adapter.state).toBe('idle')
  })

  it('should transition to terminated state after calling terminate', async () => {
    const { createKokoroAdapter } = await import('./kokoro')
    const adapter = createKokoroAdapter()
    adapter.terminate()
    expect(adapter.state).toBe('terminated')
  })

  it('should expose state getter correctly across transitions', async () => {
    const { createKokoroAdapter } = await import('./kokoro')
    const adapter = createKokoroAdapter()

    expect(adapter.state).toBe('idle')
    adapter.terminate()
    expect(adapter.state).toBe('terminated')
  })
})

describe('classifyError phase integration', () => {
  it('should produce LOAD_FAILED for load-phase errors', async () => {
    const { classifyError } = await import('../protocol')
    expect(classifyError(new Error('shader compilation failed'), 'load')).toBe('LOAD_FAILED')
  })

  it('should produce INFERENCE_FAILED for inference-phase errors', async () => {
    const { classifyError } = await import('../protocol')
    expect(classifyError(new Error('tensor shape mismatch'), 'inference')).toBe('INFERENCE_FAILED')
  })
})

describe('kokoro adapter - device loss resilience', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    recordDeviceLoss.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should start with zero device-loss count and null manifest', async () => {
    const { createKokoroAdapter } = await import('./kokoro')
    const adapter = createKokoroAdapter()

    expect(adapter.deviceLossCount).toBe(0)
    expect(adapter.manifest).toBeNull()
  })

  it('should expose manifest and deviceLossCount as readonly getters', async () => {
    const { createKokoroAdapter } = await import('./kokoro')
    const adapter = createKokoroAdapter()

    // Getters should be defined and callable
    expect(typeof adapter.deviceLossCount).toBe('number')
    // Manifest is explicitly null before any load
    expect(adapter.manifest).toBeNull()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEVICE_LOSS_WASM_THRESHOLD, MAX_RESTARTS, RESTART_DELAY_MS } from './constants'
import { createGpuWorkerHost } from './gpu-worker-host'

// A fake GPU worker: records the native 'error' listener so a test can dispatch
// a device-loss ErrorEvent, exactly like the real Worker dispatch the host
// attaches to in `ensure()`.
class FakeWorker {
  static instances: FakeWorker[] = []
  listeners = new Map<string, Set<(event: any) => void>>()
  addEventListener = vi.fn((type: string, listener: (event: any) => void) => {
    if (!this.listeners.has(type))
      this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(listener)
  })

  removeEventListener = vi.fn((type: string, listener: (event: any) => void) => {
    this.listeners.get(type)?.delete(listener)
  })

  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() {
    FakeWorker.instances.push(this)
  }

  emitError(error: unknown): void {
    for (const listener of this.listeners.get('error') ?? [])
      listener({ error })
  }
}

const recordDeviceLoss = vi.fn()
const requestAllocation = vi.fn((modelId: string) => ({ modelId, bytes: 0, allocatedAt: 0, lastUsedAt: 0 }))
const release = vi.fn()
const touch = vi.fn()
// Passthrough executor: runs work immediately with a no-op slot, like the real
// concurrency-1 executor when uncontended. Slot/preemption itself is covered by
// gpu-executor.test.ts; here we only assert the host's wiring around it.
const run = vi.fn((_id: string, _p: number, work: (slot: { yield: () => Promise<void> }) => Promise<unknown>) => work({ yield: async () => {} }))
vi.mock('./coordinator', () => ({
  getGPUCoordinator: () => ({ requestAllocation, release, touch, recordDeviceLoss }),
  getGpuExecutor: () => ({ run }),
}))

function makeHost() {
  return createGpuWorkerHost<{ id: number }>({
    modelId: 'test-model',
    createWorker: () => new FakeWorker() as unknown as Worker,
    createRpc: () => ({ id: FakeWorker.instances.length }),
  })
}

describe('gpuWorkerHost', () => {
  beforeEach(() => {
    FakeWorker.instances.length = 0
    recordDeviceLoss.mockClear()
    requestAllocation.mockClear()
    release.mockClear()
    touch.mockClear()
    run.mockClear()
    run.mockImplementation((_id: string, _p: number, work: (slot: { yield: () => Promise<void> }) => Promise<unknown>) => work({ yield: async () => {} }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts idle and ensure() lazily spawns exactly one worker', () => {
    const host = makeHost()
    expect(host.phase).toBe('idle')
    expect(host.rpc).toBeNull()

    const rpc1 = host.ensure()
    const rpc2 = host.ensure()

    expect(FakeWorker.instances.length).toBe(1)
    expect(rpc1).toBe(rpc2)
    expect(host.rpc).toBe(rpc1)

    host.terminate()
  })

  it('setPhase moves through adapter-driven phases', () => {
    const host = makeHost()
    host.setPhase('loading')
    expect(host.phase).toBe('loading')
    host.setPhase('ready')
    expect(host.phase).toBe('ready')
    host.setPhase('busy')
    expect(host.phase).toBe('busy')
  })

  it('runExclusive serializes operations (no overlap)', async () => {
    const host = makeHost()
    const events: string[] = []

    const a = host.runExclusive(async () => {
      events.push('a:start')
      await new Promise(r => setTimeout(r, 20))
      events.push('a:end')
    })
    const b = host.runExclusive(async () => {
      events.push('b:start')
      events.push('b:end')
    })

    await Promise.all([a, b])
    expect(events).toEqual(['a:start', 'a:end', 'b:start', 'b:end'])
  })

  it('runOnGpu wires a crashSignal that aborts on worker death, then clears between ops', async () => {
    const host = makeHost()
    host.ensure()
    const worker = FakeWorker.instances.at(-1)!

    let captured!: AbortSignal
    const op = host.runOnGpu('test-model', 1, undefined, async ({ crashSignal }) => {
      captured = crashSignal
      // Resolves only when the crash aborts it — proves the slot is held until then.
      await new Promise<void>((_resolve, reject) => {
        crashSignal.addEventListener('abort', () => reject(crashSignal.reason))
      })
    }).catch((error: unknown) => error)

    await Promise.resolve()
    expect(captured.aborted).toBe(false)

    worker.emitError(new Error('WebGPU device lost during op'))

    const result = await op
    expect(result).toBeInstanceOf(Error)
    expect(captured.aborted).toBe(true)

    // inflightAbort was cleared on settle: a subsequent op gets a fresh, un-aborted signal.
    let next!: AbortSignal
    await host.runOnGpu('test-model', 1, undefined, async ({ crashSignal }) => {
      next = crashSignal
    }).catch(() => {})
    expect(next.aborted).toBe(false)

    host.terminate()
  })

  it('handleWorkerError records device loss once per crash and tears the worker down', () => {
    vi.useFakeTimers()
    const host = makeHost()
    host.ensure()
    const worker = FakeWorker.instances.at(-1)!

    worker.emitError(new Error('WebGPU device lost'))
    // A second call for the SAME crash is deduped by the re-entrancy guard.
    host.handleWorkerError(new Error('WebGPU device lost'))

    expect(host.phase).toBe('error')
    expect(host.deviceLossCount).toBe(1)
    expect(recordDeviceLoss).toHaveBeenCalledTimes(1)
    expect(recordDeviceLoss).toHaveBeenCalledWith(expect.objectContaining({ modelId: 'test-model' }))
    expect(worker.terminate).toHaveBeenCalledTimes(1)

    host.terminate()
    vi.useRealTimers()
  })

  it('terminate cancels a pending restart timer so no orphan worker is spawned', async () => {
    vi.useFakeTimers()
    const host = makeHost()
    host.ensure()
    const worker = FakeWorker.instances.at(-1)!

    worker.emitError(new Error('WebGPU device lost'))
    expect(host.phase).toBe('error')
    const instancesAfterCrash = FakeWorker.instances.length

    host.terminate()
    expect(host.phase).toBe('terminated')

    // Advance past the longest backoff — the cleared timer must not respawn.
    await vi.advanceTimersByTimeAsync(RESTART_DELAY_MS * (MAX_RESTARTS + 1))
    expect(FakeWorker.instances.length).toBe(instancesAfterCrash)

    vi.useRealTimers()
  })

  it('respawns after the backoff and re-arms the crash guard', async () => {
    vi.useFakeTimers()
    const host = makeHost()
    host.ensure()
    FakeWorker.instances.at(-1)!.emitError(new Error('WebGPU device lost'))
    expect(FakeWorker.instances.length).toBe(1)

    await vi.advanceTimersByTimeAsync(RESTART_DELAY_MS)
    // Respawned; phase returns to 'idle', inviting a fresh load.
    expect(FakeWorker.instances.length).toBe(2)
    expect(host.phase).toBe('idle')

    // Guard re-armed on the fresh worker: a distinct crash advances the count.
    FakeWorker.instances.at(-1)!.emitError(new Error('WebGPU device lost'))
    expect(host.deviceLossCount).toBe(2)

    host.terminate()
    vi.useRealTimers()
  })

  it('promoteDevice promotes webgpu→wasm only once device-loss reaches the threshold', () => {
    vi.useFakeTimers()
    const host = makeHost()
    expect(host.promoteDevice('webgpu')).toBe('webgpu')
    expect(host.promoteDevice('cpu')).toBe('cpu')

    // Drive `DEVICE_LOSS_WASM_THRESHOLD` distinct crashes (re-arming the worker
    // each time). The threshold is below MAX_RESTARTS, so the host never terminates.
    for (let i = 0; i < DEVICE_LOSS_WASM_THRESHOLD; i++) {
      host.ensure()
      FakeWorker.instances.at(-1)!.emitError(new Error('WebGPU device lost'))
    }
    expect(host.deviceLossCount).toBe(DEVICE_LOSS_WASM_THRESHOLD)

    expect(host.promoteDevice('webgpu')).toBe('wasm')
    // Non-webgpu requests are never promoted.
    expect(host.promoteDevice('cpu')).toBe('cpu')

    host.terminate()
    vi.useRealTimers()
  })

  it('allocate releases the prior token before the next; terminate releases the live one', () => {
    const host = makeHost()
    host.allocate('m', 100)
    expect(requestAllocation).toHaveBeenCalledWith('m', 100)

    host.allocate('m', 200)
    expect(release).toHaveBeenCalledTimes(1)

    host.terminate()
    expect(release).toHaveBeenCalledTimes(2)
  })
})

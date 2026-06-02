import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_RESTARTS, RESTART_DELAY_MS } from '../constants'
import { consumeLoadStream } from '../contract'

// Mock Worker globally since it's not available in Node. Eventa's webworkers
// main adapter (`createContext(worker)`) drives the worker through the
// `onmessage`/`onerror`/`onmessageerror` properties and `postMessage`, while
// the adapter attaches its own `addEventListener('error', …)` for device-loss
// resilience — so the mock supports both.
class MockWorker {
  static instances: MockWorker[] = []

  onmessage: ((event: any) => void) | null = null
  onerror: ((event: any) => void) | null = null
  onmessageerror: ((event: any) => void) | null = null

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
    MockWorker.instances.push(this)
  }

  /** Simulate a fatal worker 'error' event (e.g. WebGPU device loss). */
  emitError(error: unknown): void {
    for (const listener of this.listeners.get('error') ?? [])
      listener({ error })
  }

  /**
   * Simulate a real fatal worker ErrorEvent dispatch, which fires BOTH the
   * `onerror` property (set by Eventa's createContext, which rejects in-flight
   * invokes) and every `addEventListener('error', …)` handler (the adapter's
   * native device-loss listener). Used to reproduce the double-handling path.
   */
  emitFatalError(error: unknown): void {
    const event = { error }
    // Eventa registers `onerror` first (in createContext), so it fires first.
    this.onerror?.(event)
    for (const listener of this.listeners.get('error') ?? [])
      listener(event)
  }
}
vi.stubGlobal('Worker', MockWorker)

// Mock dependencies that require browser APIs or Vue
vi.mock('../../../composables/use-inference-status', () => ({
  updateInferenceStatus: vi.fn(),
  removeInferenceStatus: vi.fn(),
}))

const recordDeviceLoss = vi.fn()
const enqueueMock = vi.fn((_id: string, _p: number, loader: () => Promise<unknown>) => loader())
vi.mock('../coordinator', () => ({
  getGPUCoordinator: () => ({
    requestAllocation: vi.fn(() => ({ modelId: 'test', estimatedBytes: 0 })),
    release: vi.fn(),
    touch: vi.fn(),
    recordDeviceLoss,
  }),
  getLoadQueue: () => ({
    enqueue: enqueueMock,
  }),
  MODEL_VRAM_ESTIMATES: {},
}))

vi.mock('@proj-airi/stage-shared', () => ({
  defaultPerfTracer: {
    withMeasure: vi.fn((_cat: string, _name: string, fn: () => unknown) => fn()),
  },
}))

// Keep the contract real, but make `consumeLoadStream` a spy that delegates to
// the real consumer by default. One test overrides it to resolve immediately so
// the adapter can reach 'ready' without driving the full Eventa load stream
// protocol — leaving the actual code under test (the unary `generate` worker-
// error path) fully real.
vi.mock('../contract', async (importActual) => {
  const actual = await importActual<typeof import('../contract')>()
  return { ...actual, consumeLoadStream: vi.fn(actual.consumeLoadStream) }
})

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

  it('should reject generation before the model is ready without changing lifecycle state', async () => {
    const { createKokoroAdapter } = await import('./kokoro')
    const adapter = createKokoroAdapter()

    await expect(adapter.generate('hello', 'af_heart' as any)).rejects.toThrow('Model not loaded. Call loadModel() first.')
    expect(adapter.state).toBe('idle')
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
    recordDeviceLoss.mockClear()
    enqueueMock.mockClear()
    enqueueMock.mockImplementation((_id: string, _p: number, loader: () => Promise<unknown>) => loader())
    MockWorker.instances.length = 0
  })

  afterEach(() => {
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

    expect(typeof adapter.deviceLossCount).toBe('number')
    expect(adapter.manifest).toBeNull()
  })

  it('should reject a load whose signal is already aborted with AbortError', async () => {
    const { createKokoroAdapter } = await import('./kokoro')
    const adapter = createKokoroAdapter()
    const controller = new AbortController()
    controller.abort('cancel preload')

    await expect(adapter.loadModel('q4', 'webgpu', { signal: controller.signal }))
      .rejects
      .toMatchObject({ name: 'AbortError' })
  })

  it('should pass the caller abort signal through to the load queue', async () => {
    const { createKokoroAdapter } = await import('./kokoro')
    const adapter = createKokoroAdapter()
    const controller = new AbortController()

    const loading = adapter.loadModel('q4', 'webgpu', { signal: controller.signal }).catch(() => {})

    await vi.waitFor(() => expect(enqueueMock).toHaveBeenCalled())

    expect(enqueueMock).toHaveBeenCalledWith(
      'kokoro-q4',
      expect.any(Number),
      expect.any(Function),
      { signal: controller.signal },
    )
    const worker = MockWorker.instances.at(-1)!
    // Eventa forwards the load request over the wire; the exact envelope is
    // internal, but a request must have been posted to the worker.
    expect(worker.postMessage).toHaveBeenCalled()

    controller.abort('cancel preload')
    await loading
  })

  it('should classify worker device-loss errors before restarting', async () => {
    const { createKokoroAdapter } = await import('./kokoro')
    const adapter = createKokoroAdapter()

    enqueueMock.mockImplementationOnce(() => new Promise(() => {}))
    const loading = adapter.loadModel('q4', 'webgpu').catch(error => error)

    await vi.waitFor(() => expect(MockWorker.instances.length).toBeGreaterThan(0))

    const worker = MockWorker.instances.at(-1)!
    // Eventa wires worker.onerror → workerErrorEvent → adapter.handleWorkerError.
    worker.emitError(new Error('WebGPU device lost while loading'))

    expect(adapter.deviceLossCount).toBe(1)
    expect(recordDeviceLoss).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'kokoro-q4',
      reason: 'unknown',
      occurredAt: expect.any(Number),
    }))

    adapter.terminate()
    void loading
  })

  // https://github.com/moeru-ai/airi PR review: chatgpt-codex-connector
  it('should handle a single in-flight generate worker crash exactly once (Issue: double handleWorkerError)', async () => {
    // ROOT CAUSE:
    //
    // A fatal worker ErrorEvent during an in-flight unary `generate` reaches
    // handleWorkerError twice for the SAME crash:
    //   1. the native 'error' listener (initializeWorker) -> handleWorkerError
    //   2. Eventa's worker.onerror emits workerErrorEvent, which rejects the
    //      in-flight `generate` invoke (defineInvoke honors `abortOnEvents` in
    //      @moeru/eventa@1.0.0-beta.5); that rejection surfaces in generate's
    //      `.catch` -> handleWorkerError again.
    //
    // handleWorkerError had no idempotency guard, so one device loss advanced
    // deviceLossCount / recordDeviceLoss and scheduled the restart twice,
    // hitting MAX_RESTARTS after half the real failures.
    //
    // We fixed this with a re-entrancy guard so one worker death is handled
    // once; the guard re-arms when a fresh worker is created.
    //
    // (Stream invokes like `load` do NOT reject on a fatal worker error in
    // beta.5, so the reproduction must go through the unary `generate` path.)
    const { createKokoroAdapter } = await import('./kokoro')
    const adapter = createKokoroAdapter()

    // Reach 'ready' without driving the full load stream protocol: resolve the
    // load consumer directly. The generate path below stays fully real.
    vi.mocked(consumeLoadStream).mockResolvedValueOnce({
      device: 'webgpu',
      metadata: { voices: { af_heart: {} } },
    } as any)
    await adapter.loadModel('q4', 'webgpu')
    expect(adapter.state).toBe('ready')

    const worker = MockWorker.instances.at(-1)!

    // Start a real unary generate; the worker never answers, so the invoke is
    // genuinely in flight when the crash arrives.
    const generating = adapter.generate('hello', 'af_heart' as any).catch(error => error)
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalled())

    // Spy installed AFTER the in-flight invoke is posted and no-op'd, so the
    // counted restart timer is exactly scheduleRestart's and doesn't leak a real
    // 1s restart. The crash reject path uses microtasks, not setTimeout.
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout').mockImplementation((() => 0) as any)

    // Real dispatch: fires Eventa's onerror (rejects the generate invoke) AND
    // the native 'error' listener — the scenario that previously double-counted.
    worker.emitFatalError(new Error('WebGPU device lost during generate'))

    await generating

    expect(adapter.deviceLossCount).toBe(1)
    expect(recordDeviceLoss).toHaveBeenCalledTimes(1)
    // Exactly one restart scheduled — signalWithTimeout uses AbortSignal.timeout,
    // so scheduleRestart is the only setTimeout in this flow.
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1)

    adapter.terminate()
  })

  // Self-review finding (Claude): generate() routed caller cancellation through
  // handleWorkerError, unlike loadModel which exempts AbortError.
  it('should restore ready and keep the worker alive when an in-flight generate is cancelled (Issue: abort routed to handleWorkerError)', async () => {
    // ROOT CAUSE:
    //
    // generate()'s outer `.catch` routed every non-notReady error through
    // handleWorkerError(), including the InferenceAbortError produced by a caller
    // cancellation:
    //
    //   }).catch((error) => {
    //     if (error === notReadyError) throw error
    //     handleWorkerError(...)   // <- AbortError reached here
    //     throw error
    //   })
    //
    // handleWorkerError tears the worker down (destroyWorker) and schedules a
    // restart, so cancelling one generation unloaded the model (state fell back
    // to 'idle' after the restart) and advanced restartAttempts — even though the
    // worker never failed. loadModel already exempts AbortError; generate did not.
    //
    // We fixed this by restoring state='ready' on caller-abort (worker + loaded
    // model are intact) and exempting AbortError from the outer catch.
    const { createKokoroAdapter } = await import('./kokoro')
    const adapter = createKokoroAdapter()

    // Reach 'ready' without driving the full load stream; the generate path
    // below stays fully real.
    vi.mocked(consumeLoadStream).mockResolvedValueOnce({
      device: 'webgpu',
      metadata: { voices: { af_heart: {} } },
    } as any)
    await adapter.loadModel('q4', 'webgpu')
    expect(adapter.state).toBe('ready')

    const worker = MockWorker.instances.at(-1)!
    const controller = new AbortController()

    // Real in-flight unary generate; the worker never answers, so the invoke is
    // genuinely in flight when the caller cancels.
    const generating = adapter.generate('hello', 'af_heart' as any, { signal: controller.signal }).catch(error => error)
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalled())

    controller.abort('user cancelled')
    const result = await generating

    // Cancellation surfaces as an AbortError to the caller ...
    expect((result as Error).name).toBe('AbortError')
    // ... but it is request-level: the worker must NOT be torn down and the model
    // must stay loaded and ready for the next generate().
    expect(worker.terminate).not.toHaveBeenCalled()
    expect(adapter.state).toBe('ready')
    // A cancel is not a device loss and must not pollute resilience accounting.
    expect(adapter.deviceLossCount).toBe(0)
    expect(recordDeviceLoss).not.toHaveBeenCalled()

    adapter.terminate()
  })
})

describe('kokoro adapter - restart timer cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    recordDeviceLoss.mockClear()
    enqueueMock.mockClear()
    enqueueMock.mockImplementation((_id: string, _p: number, loader: () => Promise<unknown>) => loader())
    MockWorker.instances.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // Self-review finding (Claude): a pending scheduleRestart timer outlived
  // terminate()/singleton replacement and spawned an orphan worker.
  it('should cancel a pending restart timer on terminate so no orphan worker is created (Issue: leaked restart timer)', async () => {
    // ROOT CAUSE:
    //
    // scheduleRestart() called setTimeout() but discarded the handle, and
    // terminate() never cleared it. After a crash (state='error') the restart
    // timer stayed armed; terminating the adapter — or replacing it via
    // getKokoroAdapter(), which discards 'error'/'terminated' singletons —
    // dropped the reference while the timer kept ticking. It then fired
    // ensureStarted() -> initializeWorker(), spawning a Worker nobody owns and
    // nobody terminates (a leaked worker + GPUDevice).
    //
    // We fixed this by storing the timer handle and clearing it in terminate()
    // (and terminating the old singleton before replacing it in
    // getKokoroAdapter).
    const { createKokoroAdapter } = await import('./kokoro')
    const adapter = createKokoroAdapter()

    vi.mocked(consumeLoadStream).mockResolvedValueOnce({
      device: 'webgpu',
      metadata: { voices: { af_heart: {} } },
    } as any)
    await adapter.loadModel('q4', 'webgpu')
    expect(adapter.state).toBe('ready')

    const worker = MockWorker.instances.at(-1)!
    // Crash the worker: handleWorkerError tears it down and arms the restart timer.
    worker.emitError(new Error('WebGPU device lost'))
    expect(adapter.state).toBe('error')
    const instancesAfterCrash = MockWorker.instances.length

    // Terminate before the backoff elapses; the armed restart timer must be cancelled.
    adapter.terminate()
    expect(adapter.state).toBe('terminated')

    // Advance well past the longest backoff — no orphan worker may be created.
    await vi.advanceTimersByTimeAsync(RESTART_DELAY_MS * (MAX_RESTARTS + 1))
    expect(MockWorker.instances.length).toBe(instancesAfterCrash)
  })
})

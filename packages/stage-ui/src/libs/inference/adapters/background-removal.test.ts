import type { BackgroundRemovalResult, LoadStreamItem } from '../contract'

import { defineInvokeHandler, defineStreamInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/webworkers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MODEL_NAMES } from '../constants'
import { backgroundRemovalLoadEvent, backgroundRemovalProcessEvent } from '../contract'

// Mock Worker globally since it's not available in Node. Eventa's webworkers
// main adapter (`createContext(worker)`) drives the worker through the
// `onmessage`/`onerror`/`onmessageerror` properties and `postMessage`, while
// the adapter attaches its own `addEventListener('error', …)`. Mirrors
// kokoro.test.ts; background removal has no device-loss/restart policy.
class MockWorker {
  static instances: MockWorker[] = []
  /**
   * Optional hook fired on construction. Lets a test attach a worker-side Eventa
   * context (see `bridgeWorker`) so a full load/process round-trip runs in-process
   * without a real Web Worker. Cleared between describes.
   */
  static onCreate: ((worker: MockWorker) => void) | null = null

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
    MockWorker.onCreate?.(this)
  }

  /** Simulate a fatal worker 'error' event (e.g. WebGPU device loss). */
  emitError(error: unknown): void {
    for (const listener of this.listeners.get('error') ?? [])
      listener({ error })
  }
}
vi.stubGlobal('Worker', MockWorker)

// Mock dependencies that require browser APIs or Vue
vi.mock('../../../composables/use-inference-status', () => ({
  updateInferenceStatus: vi.fn(),
  removeInferenceStatus: vi.fn(),
}))

const enqueueMock = vi.fn((_id: string, _p: number, loader: () => Promise<unknown>) => loader())
vi.mock('../coordinator', () => ({
  getGPUCoordinator: () => ({
    requestAllocation: vi.fn(() => ({ modelId: 'test', estimatedBytes: 0 })),
    release: vi.fn(),
    touch: vi.fn(),
    recordDeviceLoss: vi.fn(),
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

describe('background removal adapter - lifecycle', () => {
  beforeEach(() => {
    enqueueMock.mockClear()
    enqueueMock.mockImplementation((_id: string, _p: number, loader: () => Promise<unknown>) => loader())
    MockWorker.instances.length = 0
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should create adapter with idle state', async () => {
    const { createBackgroundRemovalAdapter } = await import('./background-removal')
    const adapter = createBackgroundRemovalAdapter()
    expect(adapter.state).toBe('idle')
  })

  it('should transition to terminated state after calling terminate', async () => {
    const { createBackgroundRemovalAdapter } = await import('./background-removal')
    const adapter = createBackgroundRemovalAdapter()
    adapter.terminate()
    expect(adapter.state).toBe('terminated')
  })

  it('should reject processing before the model is ready without changing lifecycle state', async () => {
    const { createBackgroundRemovalAdapter } = await import('./background-removal')
    const adapter = createBackgroundRemovalAdapter()

    // NOTICE:
    // ImageData is a DOM type with no Node global. The not-loaded guard rejects
    // before the adapter ever reads the image, so a structural stand-in is enough.
    // Root cause: this is a node-project unit test, not Vitest browser mode.
    // Removal condition: move to a *.browser.test.ts if real ImageData (alpha
    // mask application) handling needs coverage.
    const fakeImage = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as unknown as ImageData

    await expect(adapter.processImage(fakeImage))
      .rejects
      .toThrow('Model not loaded. Call load() first.')
    expect(adapter.state).toBe('idle')
  })

  it('should reject a load whose signal is already aborted with AbortError', async () => {
    const { createBackgroundRemovalAdapter } = await import('./background-removal')
    const adapter = createBackgroundRemovalAdapter()
    const controller = new AbortController()
    controller.abort('cancel preload')

    await expect(adapter.load(undefined, { signal: controller.signal }))
      .rejects
      .toMatchObject({ name: 'AbortError' })
  })

  it('should pass the caller abort signal through to the load queue', async () => {
    const { createBackgroundRemovalAdapter } = await import('./background-removal')
    const adapter = createBackgroundRemovalAdapter()
    const controller = new AbortController()

    const loading = adapter.load(undefined, { signal: controller.signal }).catch(() => {})

    await vi.waitFor(() => expect(enqueueMock).toHaveBeenCalled())

    expect(enqueueMock).toHaveBeenCalledWith(
      MODEL_NAMES.BG_REMOVAL,
      expect.any(Number),
      expect.any(Function),
      { signal: controller.signal },
    )
    const worker = MockWorker.instances.at(-1)!
    expect(worker.postMessage).toHaveBeenCalled()

    controller.abort('cancel preload')
    await loading
  })
})

// The webworkers `createContext` adapter is symmetric: it drives any endpoint
// exposing `postMessage` + `onmessage`/`onerror`. We reuse it for the worker
// side too, wiring a fake endpoint whose sends cross over to the MockWorker the
// adapter created — giving a real, in-process Eventa load/process round-trip
// without a real Web Worker. Mirrors whisper.test.ts's bridgeWorker.
function bridgeWorker(
  mockWorker: MockWorker,
  process: () => Promise<BackgroundRemovalResult>,
): void {
  const workerEndpoint: any = {
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    // worker -> main: deliver to the adapter's context (set on mockWorker.onmessage).
    postMessage: (data: unknown) => queueMicrotask(() => mockWorker.onmessage?.({ data })),
  }
  const originalPostMessage = mockWorker.postMessage
  // main -> worker: keep the spy's recording, then relay to the worker context.
  mockWorker.postMessage = vi.fn((data: unknown) => {
    originalPostMessage(data)
    queueMicrotask(() => workerEndpoint.onmessage?.({ data }))
  })

  const { context } = createContext(workerEndpoint)
  defineStreamInvokeHandler(context, backgroundRemovalLoadEvent, async function* (req) {
    yield { kind: 'ready', info: { device: req.device } } satisfies LoadStreamItem
  })
  defineInvokeHandler(context, backgroundRemovalProcessEvent, () => process())
}

describe('background removal adapter - worker error during processing', () => {
  beforeEach(() => {
    enqueueMock.mockClear()
    enqueueMock.mockImplementation((_id: string, _p: number, loader: () => Promise<unknown>) => loader())
    MockWorker.instances.length = 0
  })

  afterEach(() => {
    MockWorker.onCreate = null
    vi.restoreAllMocks()
  })

  // https://github.com/moeru-ai/airi PR review: chatgpt-codex-connector
  it('should preserve error state when a fatal worker error races an in-flight process (Issue: worker-error state masking)', async () => {
    // ROOT CAUSE:
    //
    // If a fatal worker 'error' fires while processImage() is in flight, the
    // native error listener flips state -> 'error' and cancels the mutex, and
    // Eventa then rejects the in-flight rpc.process invoke. The catch below ran
    // unconditionally:
    //
    //   catch (error) {
    //     state = 'ready'   // <- overwrites the listener's 'error'
    //     throw error
    //   }
    //
    // So the adapter ended in 'ready' with a dead worker/rpc still installed.
    // Later calls passed the `state !== 'ready'` guard and dispatched work to
    // the dead worker instead of requiring a reload/teardown.
    //
    // We fixed this by only restoring 'ready' when the state we set is still
    // 'processing' (i.e. request-level failures like caller cancellation or
    // process timeout). A concurrent worker error ('error') or terminate()
    // ('terminated') is left intact, so later calls fail the ready-state guard.
    let rejectProcess!: (reason: unknown) => void
    const processGate = new Promise<BackgroundRemovalResult>((_, reject) => {
      rejectProcess = reject
    })

    MockWorker.onCreate = worker => bridgeWorker(worker, () => processGate)

    const { createBackgroundRemovalAdapter } = await import('./background-removal')
    const adapter = createBackgroundRemovalAdapter()

    await adapter.load()
    expect(adapter.state).toBe('ready')

    // NOTICE:
    // ImageData is a DOM type with no Node global. The bridged process handler
    // never reads the pixels (it awaits the gate), so a structural stand-in is
    // enough. Root cause: this is a node-project unit test, not Vitest browser
    // mode. Removal condition: move to a *.browser.test.ts if real ImageData
    // (alpha mask application) handling needs coverage.
    const fakeImage = { data: new Uint8ClampedArray(4), width: 1, height: 1 } as unknown as ImageData
    const processing = adapter.processImage(fakeImage).catch(error => error)

    // Wait until the invoke has reached the (gated) worker handler so the
    // adapter has committed to state === 'processing'.
    await vi.waitFor(() => expect(adapter.state).toBe('processing'))

    // Fatal worker error: the native listener flips state -> 'error' and cancels
    // the mutex; Eventa would then reject the in-flight invoke (simulated by the
    // gate rejecting on the next tick).
    const worker = MockWorker.instances.at(-1)!
    worker.emitError(new Error('WebGPU device lost mid-process'))
    expect(adapter.state).toBe('error')

    rejectProcess(new Error('worker died'))
    await processing

    // The catch must not resurrect 'ready' over the listener's 'error'.
    expect(adapter.state).toBe('error')

    // A later call must fail the ready-state guard instead of dispatching to the
    // dead worker.
    await expect(adapter.processImage(fakeImage))
      .rejects
      .toThrow('Model not loaded. Call load() first.')
  })

  // Self-review finding (Claude): a fatal worker error left the dead worker
  // installed, so load() could not rebuild it.
  it('should tear down the dead worker and rebuild it on the next load() after a fatal worker error (Issue: dead worker reused)', async () => {
    // ROOT CAUSE:
    //
    // The native 'error' listener set state='error' but never tore the crashed
    // worker down, so `worker` stayed non-null. ensureWorker() only builds a
    // worker when `worker` is null:
    //
    //   function ensureWorker() { if (!worker) { worker = new Worker(...) } ... }
    //
    // so a follow-up load() reattached to the dead worker and could never
    // recover — terminate()+load() was the only escape. Whisper/kokoro destroy
    // the worker in handleWorkerError; background removal (no restart policy) did
    // not.
    //
    // We fixed this by calling destroyWorker() in the error listener, so the
    // crashed worker is terminated and the next load() builds a fresh one.
    MockWorker.onCreate = worker => bridgeWorker(worker, () => Promise.resolve({
      maskData: new Uint8Array(1),
      width: 1,
      height: 1,
    }))

    const { createBackgroundRemovalAdapter } = await import('./background-removal')
    const adapter = createBackgroundRemovalAdapter()

    await adapter.load()
    expect(adapter.state).toBe('ready')
    expect(MockWorker.instances.length).toBe(1)
    const crashed = MockWorker.instances.at(-1)!

    crashed.emitError(new Error('WebGPU device lost'))
    expect(adapter.state).toBe('error')
    // The crashed worker must be torn down so it cannot be reused.
    expect(crashed.terminate).toHaveBeenCalled()

    // A fresh load() must rebuild the worker (a new instance) and recover to ready.
    await adapter.load()
    expect(MockWorker.instances.length).toBe(2)
    expect(adapter.state).toBe('ready')
  })
})

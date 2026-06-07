import type { LoadStreamItem, WhisperTranscribeItem } from '../contract'

import { defineStreamInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/webworkers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MODEL_NAMES, RESTART_DELAY_MS, TIMEOUTS } from '../constants'
import { whisperLoadEvent, whisperTranscribeEvent } from '../contract'

// Mock Worker globally since it's not available in Node. Eventa's webworkers
// main adapter (`createContext(worker)`) drives the worker through the
// `onmessage`/`onerror`/`onmessageerror` properties and `postMessage`, while
// the adapter attaches its own `addEventListener('error', …)` for device-loss
// resilience — so the mock supports both. Mirrors kokoro.test.ts.
class MockWorker {
  static instances: MockWorker[] = []
  /**
   * Optional hook fired on construction. Lets a test attach a real worker-side
   * Eventa context (see `bridgeWorker`) so a full load/transcribe round-trip
   * runs in-process without a real Web Worker. Cleared between describes.
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

const recordDeviceLoss = vi.fn()
const runMock = vi.fn((_id: string, _p: number, work: (slot: { yield: () => Promise<void> }) => Promise<unknown>) => work({ yield: async () => {} }))
vi.mock('../coordinator', () => ({
  getGPUCoordinator: () => ({
    requestAllocation: vi.fn(() => ({ modelId: 'test', estimatedBytes: 0 })),
    release: vi.fn(),
    touch: vi.fn(),
    recordDeviceLoss,
  }),
  getGpuExecutor: () => ({
    run: runMock,
  }),
  MODEL_VRAM_ESTIMATES: {},
}))

vi.mock('@proj-airi/stage-shared', () => ({
  defaultPerfTracer: {
    withMeasure: vi.fn((_cat: string, _name: string, fn: () => unknown) => fn()),
  },
}))

const WORKER_URL = 'mock://whisper-worker'

describe('whisper adapter - lifecycle', () => {
  beforeEach(() => {
    MockWorker.instances.length = 0
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should create adapter with idle state', async () => {
    const { createWhisperAdapter } = await import('./whisper')
    const adapter = createWhisperAdapter(WORKER_URL)
    expect(adapter.state).toBe('idle')
  })

  it('should transition to terminated state after calling terminate', async () => {
    const { createWhisperAdapter } = await import('./whisper')
    const adapter = createWhisperAdapter(WORKER_URL)
    adapter.terminate()
    expect(adapter.state).toBe('terminated')
  })

  it('should reject transcription before the model is ready without changing lifecycle state', async () => {
    const { createWhisperAdapter } = await import('./whisper')
    const adapter = createWhisperAdapter(WORKER_URL)

    await expect(adapter.transcribe({ audioFloat32: new Float32Array(), language: 'en' }))
      .rejects
      .toThrow('Model not loaded. Call load() first.')
    expect(adapter.state).toBe('idle')
  })

  it('should return an unsubscribe function from onMessage', async () => {
    const { createWhisperAdapter } = await import('./whisper')
    const adapter = createWhisperAdapter(WORKER_URL)

    const unsubscribe = adapter.onMessage(() => {})
    expect(typeof unsubscribe).toBe('function')
    // Unsubscribing twice must not throw.
    expect(() => unsubscribe()).not.toThrow()
    expect(() => unsubscribe()).not.toThrow()
  })
})

describe('whisper adapter - device loss resilience', () => {
  beforeEach(() => {
    recordDeviceLoss.mockClear()
    runMock.mockClear()
    runMock.mockImplementation((_id: string, _p: number, work: (slot: { yield: () => Promise<void> }) => Promise<unknown>) => work({ yield: async () => {} }))
    MockWorker.instances.length = 0
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should start with zero device-loss count and null manifest', async () => {
    const { createWhisperAdapter } = await import('./whisper')
    const adapter = createWhisperAdapter(WORKER_URL)

    expect(adapter.deviceLossCount).toBe(0)
    expect(adapter.manifest).toBeNull()
  })

  it('should reject a load whose signal is already aborted with AbortError', async () => {
    const { createWhisperAdapter } = await import('./whisper')
    const adapter = createWhisperAdapter(WORKER_URL)
    const controller = new AbortController()
    controller.abort('cancel preload')

    await expect(adapter.load(undefined, { signal: controller.signal }))
      .rejects
      .toMatchObject({ name: 'AbortError' })
  })

  it('should pass the caller abort signal through to the GPU executor', async () => {
    const { createWhisperAdapter } = await import('./whisper')
    const adapter = createWhisperAdapter(WORKER_URL)
    const controller = new AbortController()

    const loading = adapter.load(undefined, { signal: controller.signal }).catch(() => {})

    await vi.waitFor(() => expect(runMock).toHaveBeenCalled())

    expect(runMock).toHaveBeenCalledWith(
      MODEL_NAMES.WHISPER,
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
    const { createWhisperAdapter } = await import('./whisper')
    const adapter = createWhisperAdapter(WORKER_URL)

    // Default enqueue runs the loader, which lazily creates the worker and opens
    // the (never-answered) load stream; emitting an 'error' then exercises the
    // adapter's device-loss telemetry while the load is still pending.
    const loading = adapter.load().catch(error => error)

    await vi.waitFor(() => expect(MockWorker.instances.length).toBeGreaterThan(0))

    const worker = MockWorker.instances.at(-1)!
    worker.emitError(new Error('WebGPU device lost while loading'))

    expect(adapter.deviceLossCount).toBe(1)
    expect(recordDeviceLoss).toHaveBeenCalledWith(expect.objectContaining({
      modelId: MODEL_NAMES.WHISPER,
      reason: 'unknown',
      occurredAt: expect.any(Number),
    }))

    adapter.terminate()
    void loading
  })
})

// The webworkers `createContext` adapter is symmetric: it drives any endpoint
// exposing `postMessage` + `onmessage`/`onerror`. We reuse it for the worker
// side too, wiring a fake endpoint whose sends cross over to the MockWorker the
// adapter created — giving a real, in-process Eventa load/transcribe round-trip
// without a real Web Worker or the global-`self` worker adapter.
type TranscribeGen = (req: { language: string }) => AsyncGenerator<WhisperTranscribeItem>

function bridgeWorker(mockWorker: MockWorker, transcribe: TranscribeGen): void {
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
  defineStreamInvokeHandler(context, whisperLoadEvent, async function* (req) {
    yield { kind: 'ready', info: { device: req.device } } satisfies LoadStreamItem
  })
  defineStreamInvokeHandler(context, whisperTranscribeEvent, transcribe)
}

describe('whisper adapter - transcribe stream completion', () => {
  beforeEach(() => {
    runMock.mockClear()
    runMock.mockImplementation((_id: string, _p: number, work: (slot: { yield: () => Promise<void> }) => Promise<unknown>) => work({ yield: async () => {} }))
    MockWorker.instances.length = 0
  })

  afterEach(() => {
    MockWorker.onCreate = null
    vi.restoreAllMocks()
  })

  it('should resolve with the terminal result text when the stream completes normally', async () => {
    MockWorker.onCreate = worker => bridgeWorker(worker, async function* () {
      yield { kind: 'progress', payload: { phase: 'inference', percent: -1, numTokens: 1 } } satisfies WhisperTranscribeItem
      yield { kind: 'result', text: ['hello world'] } satisfies WhisperTranscribeItem
    })

    const { createWhisperAdapter } = await import('./whisper')
    const adapter = createWhisperAdapter(WORKER_URL)

    await adapter.load()
    expect(adapter.state).toBe('ready')

    const results: string[] = []
    adapter.onMessage((event) => {
      if (event.type === 'inference-result')
        results.push(...event.output.text)
    })

    await expect(adapter.transcribe({ audioFloat32: new Float32Array([0, 0.5]), language: 'en' }))
      .resolves
      .toBe('hello world')
    expect(adapter.state).toBe('ready')
    expect(results).toEqual(['hello world'])
  })

  // https://github.com/moeru-ai/airi PR review: chatgpt-codex-connector
  it('should reject when the transcribe stream ends without a result item (Issue: missing terminal result)', async () => {
    // ROOT CAUSE:
    //
    // The transcribe contract guarantees exactly one terminal `result` item
    // (WhisperTranscribeItem in contract.ts), but the adapter's stream loop did
    // not enforce it. If the stream closed after only `progress` items (worker-
    // side cancel/early return, transport close), `text` stayed `[]`:
    //
    //   for await (const item of stream) { ...else text = item.text }
    //   const output = text[0] ?? ''            // -> ''
    //   emit({ type: 'inference-result', ... }) // bogus blank transcript
    //   state = 'ready'
    //   return output                           // resolves successfully
    //
    // So a dropped result was indistinguishable from a valid blank transcript.
    // The pre-Eventa adapter rejected/timed out instead (waitForMessage only
    // resolved on the terminal 'inference-result' message).
    //
    // We fixed this by tracking whether a `result` item was seen and throwing
    // when the stream ends without one (mirrors consumeLoadStream's `ready`
    // check), which routes through the existing catch -> state='error' + error
    // event. A genuine empty transcription still arrives as a `result` item, so
    // this does not break blank transcripts.
    MockWorker.onCreate = worker => bridgeWorker(worker, async function* () {
      yield { kind: 'progress', payload: { phase: 'inference', percent: -1, numTokens: 1 } } satisfies WhisperTranscribeItem
      // No `result` item: stream just closes.
    })

    const { createWhisperAdapter } = await import('./whisper')
    const adapter = createWhisperAdapter(WORKER_URL)

    await adapter.load()
    expect(adapter.state).toBe('ready')

    const errors: Array<{ code: string, message: string }> = []
    adapter.onMessage((event) => {
      if (event.type === 'error')
        errors.push(event.payload)
    })

    await expect(adapter.transcribe({ audioFloat32: new Float32Array([0, 0.5]), language: 'en' }))
      .rejects
      .toThrow('whisper transcribe stream ended without a result')
    expect(adapter.state).toBe('error')
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('INFERENCE_FAILED')
  })
})

describe('whisper adapter - transcribe worker crash', () => {
  beforeEach(() => {
    recordDeviceLoss.mockClear()
    runMock.mockClear()
    runMock.mockImplementation((_id: string, _p: number, work: (slot: { yield: () => Promise<void> }) => Promise<unknown>) => work({ yield: async () => {} }))
    MockWorker.instances.length = 0
  })

  afterEach(() => {
    MockWorker.onCreate = null
    vi.restoreAllMocks()
  })

  it('should reject an in-flight transcribe immediately on a worker crash (Issue: held GPU slot)', async () => {
    // ROOT CAUSE:
    //
    // transcribe runs inside the shared, concurrency-1 GPU executor slot. Under
    // @moeru/eventa@1.0.0-beta.5 a stream invoke does NOT reject on worker death
    // (worker.terminate() sends no error message), so the `for await` parked on
    // the next chunk would hang until signalWithTimeout fired at TRANSCRIBE_TIMEOUT
    // (120s) — holding the single executor slot the whole time and stalling every
    // other adapter's GPU work (loads + inference).
    //
    //   for await (const item of stream) { ... }  // parks forever on crash
    //   // slot only released when the 120s timeout signal aborts the stream
    //
    // We fixed this with `inflightAbort`: handleWorkerError aborts it, and it is
    // OR-combined (AbortSignal.any) into the stream signal, so the stream errors
    // and the transcribe rejects right away, freeing the slot.
    MockWorker.onCreate = worker => bridgeWorker(worker, async function* () {
      yield { kind: 'progress', payload: { phase: 'inference', percent: -1, numTokens: 1 } } satisfies WhisperTranscribeItem
      // Never emits a `result`; the worker "hangs" mid-transcription.
      await new Promise<never>(() => {})
    })

    const { createWhisperAdapter } = await import('./whisper')
    const adapter = createWhisperAdapter(WORKER_URL)

    await adapter.load()
    expect(adapter.state).toBe('ready')

    const errors: Array<{ code: string, message: string }> = []
    adapter.onMessage((event) => {
      if (event.type === 'error')
        errors.push(event.payload)
    })

    const transcribing = adapter
      .transcribe({ audioFloat32: new Float32Array([0, 0.5]), language: 'en' })
      .catch((error: unknown) => error)

    // Wait until the progress chunk has drained and the stream is genuinely
    // parked awaiting the (never-arriving) result before the crash lands.
    await vi.waitFor(() => expect(adapter.state).toBe('transcribing'))

    // Neutralize the post-crash restart backoff timer (mirrors the device-loss
    // tests) so it can't spawn a worker after the test. Done after waitFor so
    // its own polling timer is unaffected.
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((() => 0) as any)

    const worker = MockWorker.instances.at(-1)!
    worker.emitError(new Error('WebGPU device lost during transcribe'))

    // Must settle promptly via microtasks — no fake-timer advance, no long wait.
    // A hang here means the slot was never released.
    const result = await transcribing
    expect(result).toBeInstanceOf(Error)
    expect(adapter.state).toBe('error')
    expect(errors).toHaveLength(1)
  })
})

describe('whisper adapter - transcribe inactivity timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    recordDeviceLoss.mockClear()
    runMock.mockClear()
    runMock.mockImplementation((_id: string, _p: number, work: (slot: { yield: () => Promise<void> }) => Promise<unknown>) => work({ yield: async () => {} }))
    MockWorker.instances.length = 0
  })

  afterEach(() => {
    MockWorker.onCreate = null
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('should restart a wedged worker via the inactivity timeout without counting it as a device loss', async () => {
    // A worker that streams no progress is wedged, not crashed: the native
    // 'error' listener never fires. The adapter's first-output deadline
    // (TIMEOUTS.WHISPER_TRANSCRIBE_FIRST_CHUNK) aborts the stream and surfaces a
    // TimeoutError, which the outer catch routes through host.handleWorkerError
    // so the worker is torn down and restarted. A wedge is a TIMEOUT, not a
    // DEVICE_LOST, so device-loss accounting stays untouched.
    MockWorker.onCreate = worker => bridgeWorker(worker, async function* () {
      // Never yields an item; the worker "hangs" before producing any progress.
      await new Promise<never>(() => {})
    })

    const { createWhisperAdapter } = await import('./whisper')
    const adapter = createWhisperAdapter(WORKER_URL)

    await adapter.load()
    expect(adapter.state).toBe('ready')
    const worker = MockWorker.instances.at(-1)!

    const errors: Array<{ code: string, message: string }> = []
    adapter.onMessage((event) => {
      if (event.type === 'error')
        errors.push(event.payload)
    })

    const transcribing = adapter
      .transcribe({ audioFloat32: new Float32Array([0, 0.5]), language: 'en' })
      .catch((error: unknown) => error)

    // No progress arrives, so advancing past the first-output deadline trips the
    // timeout. advanceTimersByTimeAsync also flushes the microtasks that carry
    // the invoke to the (hanging) worker handler.
    await vi.advanceTimersByTimeAsync(TIMEOUTS.WHISPER_TRANSCRIBE_FIRST_CHUNK)

    const result = await transcribing
    expect((result as Error).name).toBe('TimeoutError')

    // The wedged worker was torn down and a restart scheduled (handleWorkerError).
    expect(worker.terminate).toHaveBeenCalled()
    expect(adapter.state).toBe('error')
    expect(errors).toHaveLength(1)
    expect(errors[0].code).toBe('TIMEOUT')
    // A timeout is not a device loss.
    expect(adapter.deviceLossCount).toBe(0)
    expect(recordDeviceLoss).not.toHaveBeenCalled()

    // Cancel the pending restart timer so it cannot spawn an orphan worker.
    adapter.terminate()
  })

  it('should re-acquire the model on the next transcribe after a wedge restart', async () => {
    // Same bare-worker-after-restart gap as kokoro: the host respawns a
    // model-less worker. Whisper recovers lazily (matching its load-on-demand,
    // ~800 MB design) — the next transcribe re-acquires the model rather than an
    // eager reload firing in the background after the restart.
    let transcribeCalls = 0
    MockWorker.onCreate = worker => bridgeWorker(worker, async function* () {
      transcribeCalls++
      // First call hangs (wedge); after the restart the second one transcribes.
      if (transcribeCalls === 1) {
        await new Promise<never>(() => {})
        return
      }
      yield { kind: 'progress', payload: { phase: 'inference', percent: -1, numTokens: 1 } } satisfies WhisperTranscribeItem
      yield { kind: 'result', text: ['recovered'] } satisfies WhisperTranscribeItem
    })

    const { createWhisperAdapter } = await import('./whisper')
    const adapter = createWhisperAdapter(WORKER_URL)

    await adapter.load()
    expect(adapter.state).toBe('ready')
    expect(MockWorker.instances.length).toBe(1)

    const transcribing = adapter
      .transcribe({ audioFloat32: new Float32Array([0, 0.5]), language: 'en' })
      .catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(TIMEOUTS.WHISPER_TRANSCRIBE_FIRST_CHUNK)
    expect(((await transcribing) as Error).name).toBe('TimeoutError')
    expect(adapter.state).toBe('error')

    // Advance past the restart backoff: the host respawns a fresh worker (#2)
    // but leaves it BARE — recovery is lazy, so the model is not reloaded yet.
    await vi.advanceTimersByTimeAsync(RESTART_DELAY_MS)
    expect(MockWorker.instances.length).toBe(2)
    expect(adapter.state).toBe('idle')

    // The next transcribe re-acquires the model on demand, then transcribes.
    await expect(adapter.transcribe({ audioFloat32: new Float32Array([0, 0.5]), language: 'en' }))
      .resolves
      .toBe('recovered')
    expect(adapter.state).toBe('ready')

    adapter.terminate()
  })
})

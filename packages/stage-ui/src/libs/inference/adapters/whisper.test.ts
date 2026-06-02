import type { LoadStreamItem, WhisperTranscribeItem } from '../contract'

import { defineStreamInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/webworkers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { MODEL_NAMES } from '../constants'
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
    enqueueMock.mockClear()
    enqueueMock.mockImplementation((_id: string, _p: number, loader: () => Promise<unknown>) => loader())
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

  it('should pass the caller abort signal through to the load queue', async () => {
    const { createWhisperAdapter } = await import('./whisper')
    const adapter = createWhisperAdapter(WORKER_URL)
    const controller = new AbortController()

    const loading = adapter.load(undefined, { signal: controller.signal }).catch(() => {})

    await vi.waitFor(() => expect(enqueueMock).toHaveBeenCalled())

    expect(enqueueMock).toHaveBeenCalledWith(
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
    enqueueMock.mockClear()
    enqueueMock.mockImplementation((_id: string, _p: number, loader: () => Promise<unknown>) => loader())
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

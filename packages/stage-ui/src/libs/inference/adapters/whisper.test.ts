import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class MockWorker {
  static instances: MockWorker[] = []

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

  dispatch(type: string, event: any): void {
    for (const listener of this.listeners.get(type) ?? [])
      listener(event)
  }
}

vi.stubGlobal('Worker', MockWorker)

vi.mock('../../../composables/use-inference-status', () => ({
  removeInferenceStatus: vi.fn(),
  updateInferenceStatus: vi.fn(),
}))

const enqueueMock = vi.fn((_id: string, _p: number, loader: () => Promise<unknown>) => loader())
const recordDeviceLoss = vi.fn()
const releaseAllocation = vi.fn()

vi.mock('../coordinator', () => ({
  getGPUCoordinator: () => ({
    recordDeviceLoss,
    release: releaseAllocation,
    requestAllocation: vi.fn(() => ({ estimatedBytes: 0, modelId: 'whisper' })),
  }),
  getLoadQueue: () => ({
    enqueue: enqueueMock,
  }),
  MODEL_VRAM_ESTIMATES: {},
}))

vi.mock('@proj-airi/stage-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@proj-airi/stage-shared')>()

  return {
    ...actual,
    defaultPerfTracer: {
      withMeasure: vi.fn((_category: string, _name: string, fn: () => unknown) => fn()),
    },
  }
})

describe('whisper adapter worker failure handling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    MockWorker.instances.length = 0
    enqueueMock.mockClear()
    enqueueMock.mockImplementation((_id: string, _p: number, loader: () => Promise<unknown>) => loader())
    recordDeviceLoss.mockClear()
    releaseAllocation.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('rejects an in-flight model load as soon as the worker errors', async () => {
    const { createWhisperAdapter } = await import('./whisper')
    const adapter = createWhisperAdapter(new URL('whisper-worker.ts', import.meta.url))

    const loading = adapter.load()

    await vi.waitFor(() => expect(enqueueMock).toHaveBeenCalled())
    const worker = MockWorker.instances.at(-1)!
    expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'load-model' }))

    worker.dispatch('error', { error: new Error('Whisper worker crashed while loading') })

    await expect(loading).rejects.toThrow('Whisper worker crashed while loading')
    expect(adapter.state).toBe('error')
  })

  it('rejects an in-flight transcription as soon as the worker errors', async () => {
    const { createWhisperAdapter } = await import('./whisper')
    const adapter = createWhisperAdapter(new URL('whisper-worker.ts', import.meta.url))

    const loading = adapter.load()

    await vi.waitFor(() => expect(enqueueMock).toHaveBeenCalled())
    const worker = MockWorker.instances.at(-1)!
    const loadRequest = worker.postMessage.mock.calls.find(([message]) => message.type === 'load-model')?.[0]
    expect(loadRequest).toBeDefined()

    worker.dispatch('message', {
      data: {
        device: 'webgpu',
        modelId: 'whisper',
        requestId: loadRequest!.requestId,
        type: 'model-ready',
      },
    })
    await loading
    expect(adapter.state).toBe('ready')

    const transcribing = adapter.transcribe({ audio: 'data:audio/wav;base64,test', language: 'en' })

    await vi.waitFor(() => {
      expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'run-inference' }))
    })

    worker.dispatch('error', { error: new Error('Whisper worker crashed during transcription') })

    await expect(transcribing).rejects.toThrow('Whisper worker crashed during transcription')
    expect(adapter.state).toBe('error')
  })

  // https://github.com/moeru-ai/airi/issues/1342
  // https://github.com/moeru-ai/airi/pull/2130
  it('issue #1342 terminates errored singleton adapters before replacing them', async () => {
    // ROOT CAUSE:
    //
    // getWhisperAdapter() replaced `error` / `terminated` singletons with a new
    // createWhisperAdapter() without calling terminate(). Errored adapters can
    // still hold a Worker and GPU allocation token after abort/timeout/worker
    // failure, so repeated retries leaked ~800MB allocations.
    //
    // We fixed this by terminating the previous singleton before assigning the
    // replacement.
    vi.resetModules()
    MockWorker.instances.length = 0

    const { getWhisperAdapter } = await import('./whisper')
    const first = await getWhisperAdapter()

    const loading = first.load()
    await vi.waitFor(() => expect(enqueueMock).toHaveBeenCalled())
    const worker = MockWorker.instances.at(-1)!
    const loadRequest = worker.postMessage.mock.calls.find(([message]) => message.type === 'load-model')?.[0]
    expect(loadRequest).toBeDefined()

    worker.dispatch('message', {
      data: {
        device: 'webgpu',
        modelId: 'whisper',
        requestId: loadRequest!.requestId,
        type: 'model-ready',
      },
    })
    await loading
    expect(first.state).toBe('ready')

    const transcribing = first.transcribe({ audio: 'data:audio/wav;base64,test', language: 'en' })
    await vi.waitFor(() => {
      expect(worker.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'run-inference' }))
    })

    // Simulate a transcription timeout / abort path that marks state=error without
    // going through handleWorkerError's destroyWorker().
    worker.dispatch('message', {
      data: {
        type: 'error',
        requestId: worker.postMessage.mock.calls.find(([message]) => message.type === 'run-inference')?.[0].requestId,
        payload: { message: 'transcription failed', code: 'TIMEOUT' },
      },
    })
    await expect(transcribing).rejects.toThrow('transcription failed')
    expect(first.state).toBe('error')

    const second = await getWhisperAdapter()
    expect(second).not.toBe(first)
    expect(first.state).toBe('terminated')
    expect(worker.terminate).toHaveBeenCalled()
    expect(releaseAllocation).toHaveBeenCalled()
  })
})

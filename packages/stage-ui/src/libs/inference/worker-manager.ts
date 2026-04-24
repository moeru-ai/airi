/**
 * Generic inference worker manager.
 *
 * Provides lifecycle management (start / restart / terminate), request
 * serialisation via async-mutex, timeout handling, and a unified
 * message protocol for any inference worker.
 *
 * NOTICE: Currently not consumed by any adapter. Adapters implement their
 * own lifecycle management directly. This module is retained as a reusable
 * building block for future adapters that need generic worker management.
 */

import type {
  ErrorPayload,
  LoadModelRequest,
  ModelReadyResponse,
  ProgressPayload,
  RunInferenceRequest,
  WorkerOutboundMessage,
} from './protocol'

import { errorMessageFrom } from '@moeru/std'
import { Mutex } from 'async-mutex'

import { createRequestId } from './protocol'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkerManagerState
  = | 'idle'
    | 'loading'
    | 'ready'
    | 'running'
    | 'error'
    | 'terminated'

export interface WorkerManagerOptions {
  /** Factory that creates a fresh Worker instance */
  createWorker: () => Worker
  /** Timeout for model loading in ms (default 120 000) */
  loadTimeout?: number
  /** Timeout for a single inference call in ms (default 120 000) */
  inferenceTimeout?: number
  /** Maximum automatic restart attempts after worker errors (default 3) */
  maxRestarts?: number
  /** Base delay between restarts in ms; multiplied by attempt number (default 1 000) */
  restartDelayMs?: number
}

export interface InferenceWorkerManager {
  /**
   * Load a model in the worker.
   * Returns domain-specific metadata (e.g. Kokoro voices list).
   */
  loadModel: (
    request: Omit<LoadModelRequest, 'type' | 'requestId'>,
    onProgress?: (p: ProgressPayload) => void,
  ) => Promise<ModelReadyResponse>

  /**
   * Run inference with the currently loaded model.
   * `TInput` / `TOutput` are opaque to the manager — the adapter defines them.
   */
  run: <TInput, TOutput>(
    input: TInput,
    onProgress?: (p: ProgressPayload) => void,
  ) => Promise<TOutput>

  /** Unload the current model but keep the worker alive */
  unload: () => Promise<void>

  /** Terminate the worker entirely */
  terminate: () => void

  /** Current state */
  readonly state: WorkerManagerState

  /** Last error, if any */
  readonly lastError: ErrorPayload | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface WaitForMessageOptions<T extends WorkerOutboundMessage> {
  /** Only resolve when the predicate returns true */
  predicate: (msg: WorkerOutboundMessage) => msg is T
  /** Called for every message that does NOT satisfy the predicate */
  onOther?: (msg: WorkerOutboundMessage) => void
  /** Timeout in ms */
  timeout?: number
}

function waitForWorkerMessage<T extends WorkerOutboundMessage>(
  worker: Worker,
  options: WaitForMessageOptions<T>,
): Promise<T> {
  const { predicate, onOther, timeout } = options

  return new Promise<T>((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const handler = (event: MessageEvent<WorkerOutboundMessage>) => {
      if (predicate(event.data)) {
        if (timeoutId !== undefined)
          clearTimeout(timeoutId)
        worker.removeEventListener('message', handler)
        resolve(event.data)
      }
      else if (event.data.type === 'error') {
        if (timeoutId !== undefined)
          clearTimeout(timeoutId)
        worker.removeEventListener('message', handler)
        const payload = (event.data as any).payload
        reject(new Error(payload?.message ?? 'Worker error'))
      }
      else {
        onOther?.(event.data)
      }
    }

    worker.addEventListener('message', handler)

    if (timeout !== undefined) {
      timeoutId = setTimeout(() => {
        worker.removeEventListener('message', handler)
        reject(new Error(`Timeout after ${timeout}ms`))
      }, timeout)
    }
  })
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const DEFAULT_LOAD_TIMEOUT = 120_000
const DEFAULT_INFERENCE_TIMEOUT = 120_000
const DEFAULT_MAX_RESTARTS = 3
const DEFAULT_RESTART_DELAY_MS = 1_000

export function createInferenceWorkerManager(
  options: WorkerManagerOptions,
): InferenceWorkerManager {
  const {
    createWorker,
    loadTimeout = DEFAULT_LOAD_TIMEOUT,
    inferenceTimeout = DEFAULT_INFERENCE_TIMEOUT,
    maxRestarts = DEFAULT_MAX_RESTARTS,
    restartDelayMs = DEFAULT_RESTART_DELAY_MS,
  } = options

  let worker: Worker | null = null
  let state: WorkerManagerState = 'idle'
  let lastError: ErrorPayload | null = null
  let restartAttempts = 0

  const operationMutex = new Mutex()
  const lifecycleMutex = new Mutex()

  // -- Worker lifecycle -----------------------------------------------------

  function initializeWorker(): void {
    worker = createWorker()
    worker.addEventListener('error', handleWorkerError)
  }

  function handleWorkerError(event: ErrorEvent | Error): void {
    const message = event instanceof Error
      ? event.message
      : (event as ErrorEvent).message ?? 'Unknown worker error'

    lastError = {
      code: 'UNKNOWN',
      message,
      recoverable: restartAttempts < maxRestarts,
    }
    state = 'error'

    // Reject all pending operations
    operationMutex.cancel()

    // Clean up and try to restart
    destroyWorker()
    scheduleRestart()
  }

  function destroyWorker(): void {
    if (worker) {
      worker.terminate()
      worker = null
    }
  }

  function scheduleRestart(): void {
    if (restartAttempts >= maxRestarts) {
      console.error(
        `[InferenceWorkerManager] Max restart attempts (${maxRestarts}) reached. Giving up.`,
      )
      return
    }

    restartAttempts++
    const delay = restartDelayMs * restartAttempts

    console.warn(
      `[InferenceWorkerManager] Restarting worker in ${delay}ms `
      + `(attempt ${restartAttempts}/${maxRestarts})`,
    )

    setTimeout(() => {
      ensureStarted().catch((err) => {
        console.error('[InferenceWorkerManager] Failed to restart:', errorMessageFrom(err))
      })
    }, delay)
  }

  function onSuccessfulOperation(): void {
    restartAttempts = 0
  }

  async function ensureStarted(): Promise<void> {
    await lifecycleMutex.runExclusive(async () => {
      if (!worker) {
        initializeWorker()
        state = 'idle'
      }
    })
  }

  // -- Public API -----------------------------------------------------------

  async function loadModel(
    request: Omit<LoadModelRequest, 'type' | 'requestId'>,
    onProgress?: (p: ProgressPayload) => void,
  ): Promise<ModelReadyResponse> {
    await ensureStarted()

    return operationMutex.runExclusive(async () => {
      state = 'loading'
      const requestId = createRequestId()

      const resultPromise = waitForWorkerMessage<ModelReadyResponse>(worker!, {
        predicate: (msg): msg is ModelReadyResponse =>
          msg.type === 'model-ready' && msg.requestId === requestId,
        onOther: (msg) => {
          if (msg.type === 'progress' && msg.requestId === requestId && onProgress)
            onProgress(msg.payload)
        },
        timeout: loadTimeout,
      })

      const message: LoadModelRequest = {
        type: 'load-model',
        requestId,
        ...request,
      }
      worker!.postMessage(message)

      try {
        const result = await resultPromise
        state = 'ready'
        onSuccessfulOperation()
        return result
      }
      catch (error) {
        state = 'error'
        handleWorkerError(error instanceof Error ? error : new Error(errorMessageFrom(error)))
        throw error
      }
    })
  }

  async function run<TInput, TOutput>(
    input: TInput,
    onProgress?: (p: ProgressPayload) => void,
  ): Promise<TOutput> {
    return operationMutex.runExclusive(async () => {
      if (!worker)
        throw new Error('Worker not initialized. Call loadModel() first.')

      state = 'running'
      const requestId = createRequestId()

      type ResultMsg = WorkerOutboundMessage & { type: 'inference-result', requestId: string }

      const resultPromise = waitForWorkerMessage<ResultMsg>(worker, {
        predicate: (msg): msg is ResultMsg =>
          msg.type === 'inference-result' && msg.requestId === requestId,
        onOther: (msg) => {
          if (msg.type === 'progress' && msg.requestId === requestId && onProgress)
            onProgress(msg.payload)
        },
        timeout: inferenceTimeout,
      })

      const message: RunInferenceRequest<TInput> = {
        type: 'run-inference',
        requestId,
        input,
      }
      worker.postMessage(message)

      try {
        const result = await resultPromise
        state = 'ready'
        onSuccessfulOperation()
        return result.output as TOutput
      }
      catch (error) {
        state = 'error'
        handleWorkerError(error instanceof Error ? error : new Error(errorMessageFrom(error)))
        throw error
      }
    })
  }

  async function unloadModel(): Promise<void> {
    return operationMutex.runExclusive(async () => {
      if (!worker)
        return

      const requestId = createRequestId()

      type UnloadedMsg = WorkerOutboundMessage & { type: 'model-unloaded', requestId: string }

      const resultPromise = waitForWorkerMessage<UnloadedMsg>(worker, {
        predicate: (msg): msg is UnloadedMsg =>
          msg.type === 'model-unloaded' && msg.requestId === requestId,
        timeout: 10_000,
      })

      worker.postMessage({ type: 'unload-model', requestId })
      await resultPromise

      state = 'idle'
    })
  }

  function terminateManager(): void {
    operationMutex.cancel()
    destroyWorker()
    state = 'terminated'
  }

  return {
    loadModel: loadModel as InferenceWorkerManager['loadModel'],
    run,
    unload: unloadModel,
    terminate: terminateManager,
    get state() { return state },
    get lastError() { return lastError },
  }
}

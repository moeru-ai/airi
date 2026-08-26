/**
 * Kokoro TTS inference adapter.
 *
 * Uses the unified inference protocol from protocol.ts.
 * The worker now speaks the same protocol — no translation layer needed.
 */

import type { VoiceKey, Voices } from '../../../workers/kokoro/types'
import type { AllocationToken } from '../gpu-resource-coordinator'
import type { ProgressPayload } from '../protocol'

import { toWav } from '@proj-airi/audio/encoding'
import { defaultPerfTracer } from '@proj-airi/stage-shared'
import { Mutex } from 'async-mutex'

import { removeInferenceStatus, updateInferenceStatus } from '../../../composables/use-inference-status'
import { DEVICE_LOSS_WASM_THRESHOLD, MAX_RESTARTS, MODEL_NAMES, RESTART_DELAY_MS, TIMEOUTS } from '../constants'
import { getGPUCoordinator, getLoadQueue, MODEL_VRAM_ESTIMATES } from '../coordinator'
import { LOAD_PRIORITY } from '../load-queue'
import { classifyDeviceLossReason, classifyError, createRequestId, InferenceAbortError, throwIfAborted } from '../protocol'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KokoroAdapter {
  /** Number of WebGPU device-loss events observed by this adapter */
  readonly deviceLossCount: number

  /**
   * Generate speech audio from text.
   * Pass `options.signal` to cancel; rejects with `InferenceAbortError`.
   */
  generate: (
    text: string,
    voice: VoiceKey,
    options?: { signal?: AbortSignal },
  ) => Promise<ArrayBuffer>

  /** Get the voices from the last loaded model */
  getVoices: () => Voices

  /**
   * Load a TTS model with the given quantization and device.
   * Pass `options.signal` to cancel the load; the returned promise will
   * reject with `InferenceAbortError` (name: `'AbortError'`).
   */
  loadModel: (
    quantization: string,
    device: string,
    options?: {
      onProgress?: (p: ProgressPayload) => void
      signal?: AbortSignal
    },
  ) => Promise<Voices>

  /**
   * Snapshot of the last successful load config, or null if never loaded.
   * `device` reflects the device actually used (post WASM promotion / worker
   * fallback), which may differ from the device requested by the caller.
   */
  readonly manifest: null | { device: string, quantization: string }

  /** Current state */
  readonly state: 'error' | 'idle' | 'loading' | 'ready' | 'running' | 'terminated'

  /** Terminate the worker */
  terminate: () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOAD_MODEL_TIMEOUT = TIMEOUTS.KOKORO_LOAD
const GENERATE_TIMEOUT = TIMEOUTS.KOKORO_GENERATE

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface KokoroManifest {
  device: string
  quantization: string
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createKokoroAdapter(): KokoroAdapter {
  let worker: null | Worker = null
  let state: KokoroAdapter['state'] = 'idle'
  let voices: null | Voices = null
  let restartAttempts = 0
  let allocationToken: AllocationToken | null = null
  let currentModelStatusId: null | string = null
  let errorListener: ((event: ErrorEvent) => void) | null = null

  // NOTICE: Device-loss resilience state. `lastManifest` records the last
  // successful load config so scheduleRestart can reconstruct context if the
  // worker died. `deviceLossCount` tracks WebGPU device-loss events so we
  // can promote to WASM after repeated failures (see DEVICE_LOSS_WASM_THRESHOLD).
  let lastManifest: KokoroManifest | null = null
  let deviceLossCount = 0

  const operationMutex = new Mutex()
  const lifecycleMutex = new Mutex()

  function initializeWorker(): void {
    worker = new Worker(
      new URL('../../../workers/kokoro/worker.ts', import.meta.url),
      { type: 'module' },
    )
    errorListener = (event: ErrorEvent) => handleWorkerError(event)
    worker.addEventListener('error', errorListener)
  }

  function handleWorkerError(event: Error | ErrorEvent): void {
    state = 'error'
    operationMutex.cancel()

    // Record device-loss telemetry before teardown so the coordinator sees it
    // even if the adapter is never used again.
    const code = classifyError(event instanceof Error ? event : (event as ErrorEvent).error ?? event)
    if (code === 'DEVICE_LOST') {
      deviceLossCount++
      getGPUCoordinator().recordDeviceLoss({
        modelId: currentModelStatusId ?? MODEL_NAMES.KOKORO,
        occurredAt: Date.now(),
        reason: classifyDeviceLossReason(event instanceof Error ? event : (event as ErrorEvent).error ?? event),
      })
    }

    destroyWorker()
    scheduleRestart()
  }

  function destroyWorker(): void {
    if (worker) {
      if (errorListener)
        worker.removeEventListener('error', errorListener)
      errorListener = null
      worker.terminate()
      worker = null
    }
  }

  function scheduleRestart(): void {
    if (restartAttempts >= MAX_RESTARTS) {
      console.error(
        `[KokoroAdapter] Max restart attempts (${MAX_RESTARTS}) reached.`,
      )
      // NOTICE: Transition to 'terminated' so getKokoroAdapter() can detect
      // the dead singleton and create a fresh adapter on next access.
      state = 'terminated'
      return
    }

    restartAttempts++
    const delay = RESTART_DELAY_MS * restartAttempts

    console.warn(
      `[KokoroAdapter] Restarting in ${delay}ms `
      + `(attempt ${restartAttempts}/${MAX_RESTARTS})`,
    )

    setTimeout(() => {
      ensureStarted().catch((err) => {
        console.error('[KokoroAdapter] Restart failed:', err)
      })
    }, delay)
  }

  function onSuccess(): void {
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
    quantization: string,
    device: string,
    options?: {
      onProgress?: (p: ProgressPayload) => void
      signal?: AbortSignal
    },
  ): Promise<Voices> {
    // NOTICE: Proactive WASM promotion. If this adapter has suffered repeated
    // WebGPU device-loss events, webgpu is unreliable on this device and we
    // should not keep retrying. The worker's per-load dtype/device fallback
    // chain handles transient failures; this guard handles persistent ones.
    let effectiveDevice = device
    if (
      device === 'webgpu'
      && deviceLossCount >= DEVICE_LOSS_WASM_THRESHOLD
    ) {
      console.warn(
        `[KokoroAdapter] ${deviceLossCount} device-loss events recorded, `
        + `promoting load from webgpu to wasm.`,
      )
      effectiveDevice = 'wasm'
    }
    throwIfAborted(options?.signal)
    await ensureStarted()

    return defaultPerfTracer.withMeasure('inference', 'kokoro-load-model', () => operationMutex.runExclusive(async () => {
      throwIfAborted(options?.signal)
      state = 'loading'
      const modelStatusId = `kokoro-${quantization}`

      // Clear previous model status when switching models
      if (currentModelStatusId && currentModelStatusId !== modelStatusId)
        removeInferenceStatus(currentModelStatusId)
      currentModelStatusId = modelStatusId

      updateInferenceStatus(modelStatusId, { device: effectiveDevice as any, state: 'downloading' })

      // Use the global load queue to serialize model loads across all adapters
      return getLoadQueue().enqueue(modelStatusId, LOAD_PRIORITY.TTS, async () => {
        throwIfAborted(options?.signal)
        const requestId = createRequestId()
        // Signal is also passed to the queue below for pending-entry removal

        const readyPromise = waitForWorkerMessage<any>(worker!, requestId, 'model-ready', LOAD_MODEL_TIMEOUT, (data) => {
          if (data.type === 'progress') {
            const payload = data.payload
            const progress: ProgressPayload = {
              file: payload.file,
              loaded: payload.loaded,
              message: payload.message,
              percent: payload.percent ?? -1,
              phase: payload.phase ?? 'download',
              total: payload.total,
            }
            // Update reactive inference status
            updateInferenceStatus(modelStatusId, { progress })
            options?.onProgress?.(progress)
          }
        }, options?.signal)

        worker!.postMessage({
          device: effectiveDevice,
          dtype: quantization,
          modelId: MODEL_NAMES.KOKORO,
          requestId,
          type: 'load-model',
        })

        const response = await readyPromise
        voices = (response.metadata?.voices as Voices) ?? null

        // Track GPU memory allocation
        const coordinator = getGPUCoordinator()
        if (allocationToken)
          coordinator.release(allocationToken)
        const estimateKey = `kokoro-${quantization}`
        const estimated = MODEL_VRAM_ESTIMATES[estimateKey] ?? 165 * 1024 * 1024
        allocationToken = coordinator.requestAllocation(`kokoro-${quantization}`, estimated)

        // Record manifest so consumers can inspect how the adapter resolved
        // device selection after fallback / WASM promotion.
        lastManifest = { device: (response.device ?? effectiveDevice) as string, quantization }

        state = 'ready'
        updateInferenceStatus(modelStatusId, { device: (response.device ?? effectiveDevice) as any, state: 'ready' })
        onSuccess()
        if (!voices)
          throw new Error('Kokoro worker did not return voice metadata')
        return voices
      }, { signal: options?.signal })
    }), { device: effectiveDevice, quantization }).catch((error) => {
      // Don't route AbortError through handleWorkerError — cancellation is
      // not a worker failure and shouldn't trigger restart logic.
      if ((error as Error)?.name === 'AbortError')
        throw error
      handleWorkerError(error instanceof Error ? error : new Error(String(error)))
      throw error
    })
  }

  async function generate(
    text: string,
    voice: VoiceKey,
    options?: { signal?: AbortSignal },
  ): Promise<ArrayBuffer> {
    throwIfAborted(options?.signal)
    const notReadyError = new Error('Model not loaded. Call loadModel() first.')

    return defaultPerfTracer.withMeasure('inference', 'kokoro-generate', () => operationMutex.runExclusive(async () => {
      throwIfAborted(options?.signal)
      if (!worker || state !== 'ready')
        throw notReadyError

      // Update LRU timestamp for memory pressure tracking
      if (allocationToken)
        getGPUCoordinator().touch(allocationToken.modelId)

      state = 'running'
      const requestId = createRequestId()

      const resultPromise = waitForWorkerMessage<any>(
        worker,
        requestId,
        'inference-result',
        GENERATE_TIMEOUT,
        undefined,
        options?.signal,
      )

      worker.postMessage({
        input: { action: 'generate', text, voice },
        requestId,
        type: 'run-inference',
      })

      const response = await resultPromise
      const output = response.output

      if (output.action === 'generate') {
        state = 'ready'
        onSuccess()
        return toWav((output.samples as Float32Array).buffer, output.samplingRate as number)
      }

      const errorCode = classifyError(new Error('Unexpected output action'))
      throw new Error(`[${errorCode}] Unexpected output action: ${output.action}`)
    }), { text: text.slice(0, 50), voice }).catch((error) => {
      if (error === notReadyError)
        throw error

      // Cancellation is a caller-controlled lifecycle outcome, not a worker
      // failure. Keep the loaded model available and avoid restarting the
      // worker after waitForWorkerMessage has already posted `cancel`.
      if ((error as Error)?.name === 'AbortError') {
        if (state === 'running')
          state = 'ready'
        throw error
      }

      handleWorkerError(error instanceof Error ? error : new Error(String(error)))
      throw error
    })
  }

  function getVoices(): Voices {
    if (!voices)
      throw new Error('Model not loaded. Call loadModel() first.')
    return voices
  }

  function terminateAdapter(): void {
    operationMutex.cancel()
    destroyWorker()
    if (allocationToken) {
      removeInferenceStatus(allocationToken.modelId)
      getGPUCoordinator().release(allocationToken)
      allocationToken = null
    }
    voices = null
    state = 'terminated'
  }

  return {
    get deviceLossCount() { return deviceLossCount },
    generate,
    getVoices,
    loadModel,
    get manifest() { return lastManifest },
    get state() { return state },
    terminate: terminateAdapter,
  }
}

/**
 * Wait for a specific message type from the worker, filtered by requestId.
 * Calls `callback` for interleaved messages (e.g. progress).
 *
 * If `signal` is provided and aborts, the returned Promise rejects with
 * `InferenceAbortError` and a `cancel` message is sent to the worker so
 * it can discard the result when it eventually arrives.
 */
function waitForWorkerMessage<T = any>(
  worker: Worker,
  requestId: string,
  targetType: string,
  timeout: number,
  callback?: (data: any) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let abortListener: (() => void) | null = null

    function cleanup(): void {
      if (timeoutId !== undefined)
        clearTimeout(timeoutId)
      worker.removeEventListener('message', handler)
      if (abortListener && signal)
        signal.removeEventListener('abort', abortListener)
    }

    function handler(event: MessageEvent): void {
      if (event.data.requestId !== requestId)
        return

      if (event.data.type === targetType) {
        cleanup()
        resolve(event.data as T)
      }
      else if (event.data.type === 'error') {
        cleanup()
        const code = event.data.payload?.code
        if (code === 'CANCELLED')
          reject(new InferenceAbortError(event.data.payload?.message))
        else
          reject(new Error(event.data.payload?.message ?? 'Worker error'))
      }
      else {
        callback?.(event.data)
      }
    }

    worker.addEventListener('message', handler)

    timeoutId = setTimeout(() => {
      cleanup()
      reject(new Error(`Kokoro: timeout after ${timeout}ms waiting for '${targetType}'`))
    }, timeout)

    if (signal) {
      if (signal.aborted) {
        cleanup()
        // Tell the worker to discard the result when it arrives
        worker.postMessage({ requestId: createRequestId(), targetRequestId: requestId, type: 'cancel' })
        reject(new InferenceAbortError(typeof signal.reason === 'string' ? signal.reason : undefined))
        return
      }
      abortListener = () => {
        cleanup()
        worker.postMessage({ requestId: createRequestId(), targetRequestId: requestId, type: 'cancel' })
        const reason = signal.reason
        reject(reason instanceof Error ? reason : new InferenceAbortError(typeof reason === 'string' ? reason : undefined))
      }
      signal.addEventListener('abort', abortListener)
    }
  })
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let globalAdapter: KokoroAdapter | null = null
const singletonMutex = new Mutex()

/**
 * Get the global Kokoro adapter instance.
 * Creates and starts the worker on first call.
 * Automatically re-creates the adapter if it has entered a terminal state
 * ('terminated' or 'error' after max restarts exhausted).
 */
export async function getKokoroAdapter(): Promise<KokoroAdapter> {
  return singletonMutex.runExclusive(async () => {
    if (
      !globalAdapter
      || globalAdapter.state === 'terminated'
      || globalAdapter.state === 'error'
    ) {
      globalAdapter = createKokoroAdapter()
    }
    return globalAdapter
  })
}

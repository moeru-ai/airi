/**
 * Whisper ASR inference adapter.
 *
 * Uses the unified inference protocol from protocol.ts.
 * Preserves the onMessage API for streaming UI updates by forwarding
 * unified protocol messages to subscribers.
 */

import type { AllocationToken } from '../gpu-resource-coordinator'
import type { ProgressPayload } from '../protocol'

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

export type WhisperState
  = | 'idle'
    | 'loading'
    | 'ready'
    | 'transcribing'
    | 'error'
    | 'terminated'

export interface WhisperTranscribeInput {
  audio?: string
  audioFloat32?: Float32Array
  language: string
}

/**
 * Unified message events for Whisper, based on protocol.ts types.
 * These replace the old status-based MessageEvents.
 */
export type WhisperEvent
  = | { type: 'progress', payload: ProgressPayload & Record<string, unknown> }
    | { type: 'model-ready' }
    | { type: 'inference-result', output: { text: string[] } }
    | { type: 'error', payload: { code: string, message: string } }

export interface WhisperAdapter {
  /**
   * Load the Whisper model.
   * Pass `options.signal` to cancel the load; rejects with `InferenceAbortError`.
   */
  load: (
    onProgress?: (p: ProgressPayload) => void,
    options?: { signal?: AbortSignal },
  ) => Promise<void>

  /**
   * Transcribe audio, returning the text result.
   * Pass `options.signal` to cancel; rejects with `InferenceAbortError`.
   */
  transcribe: (
    input: WhisperTranscribeInput,
    options?: { signal?: AbortSignal },
  ) => Promise<string>

  /** Terminate the worker */
  terminate: () => void

  /** Current state */
  readonly state: WhisperState

  /**
   * Subscribe to unified protocol events for streaming UI updates.
   * Returns an unsubscribe function.
   */
  onMessage: (handler: (event: WhisperEvent) => void) => () => void

  /**
   * Snapshot of the last successful load, or null if never loaded.
   * `device` reflects what the worker actually used (post-fallback).
   */
  readonly manifest: { device: string } | null

  /** Number of WebGPU device-loss events observed by this adapter */
  readonly deviceLossCount: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOAD_TIMEOUT = TIMEOUTS.WHISPER_LOAD
const TRANSCRIBE_TIMEOUT = TIMEOUTS.WHISPER_TRANSCRIBE

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWhisperAdapter(workerUrl: string | URL): WhisperAdapter {
  let worker: Worker | null = null
  let state: WhisperState = 'idle'
  let allocationToken: AllocationToken | null = null
  let restartAttempts = 0
  let messageListener: ((event: MessageEvent) => void) | null = null
  let errorListener: ((event: ErrorEvent) => void) | null = null
  const messageHandlers = new Set<(event: WhisperEvent) => void>()

  // NOTICE: Device-loss resilience state. See kokoro.ts for rationale.
  let lastManifest: { device: string } | null = null
  let deviceLossCount = 0

  const operationMutex = new Mutex()

  function handleWorkerError(event: ErrorEvent | Error): void {
    state = 'error'
    operationMutex.cancel()

    const code = classifyError(event instanceof Error ? event : (event as ErrorEvent).error ?? event)
    if (code === 'DEVICE_LOST') {
      deviceLossCount++
      getGPUCoordinator().recordDeviceLoss({
        modelId: MODEL_NAMES.WHISPER,
        reason: classifyDeviceLossReason(event instanceof Error ? event : (event as ErrorEvent).error ?? event),
        occurredAt: Date.now(),
      })
    }

    destroyWorker()
    scheduleRestart()
  }

  function destroyWorker(): void {
    if (worker) {
      if (messageListener)
        worker.removeEventListener('message', messageListener)
      if (errorListener)
        worker.removeEventListener('error', errorListener)
      messageListener = null
      errorListener = null
      worker.terminate()
      worker = null
    }
  }

  function scheduleRestart(): void {
    if (restartAttempts >= MAX_RESTARTS) {
      console.error(`[WhisperAdapter] Max restart attempts (${MAX_RESTARTS}) reached.`)
      // NOTICE: Transition to 'terminated' so callers can detect the dead adapter
      // instead of being stuck in 'error' state indefinitely.
      state = 'terminated'
      return
    }

    restartAttempts++
    const delay = RESTART_DELAY_MS * restartAttempts
    console.warn(`[WhisperAdapter] Restarting in ${delay}ms (attempt ${restartAttempts}/${MAX_RESTARTS})`)

    setTimeout(() => {
      ensureWorker()
    }, delay)
  }

  function onSuccess(): void {
    restartAttempts = 0
  }

  function ensureWorker(): Worker {
    if (!worker) {
      worker = new Worker(workerUrl, { type: 'module' })
      messageListener = (event: MessageEvent) => {
        const data = event.data
        // Forward unified protocol messages to subscribers
        if (data.type === 'progress') {
          const evt: WhisperEvent = { type: 'progress', payload: data.payload }
          for (const handler of messageHandlers) handler(evt)
        }
        else if (data.type === 'model-ready') {
          const evt: WhisperEvent = { type: 'model-ready' }
          for (const handler of messageHandlers) handler(evt)
        }
        else if (data.type === 'inference-result') {
          const evt: WhisperEvent = { type: 'inference-result', output: data.output }
          for (const handler of messageHandlers) handler(evt)
        }
        else if (data.type === 'error') {
          const evt: WhisperEvent = { type: 'error', payload: data.payload }
          for (const handler of messageHandlers) handler(evt)
        }
      }
      errorListener = (event: ErrorEvent) => {
        handleWorkerError(event)
      }
      worker.addEventListener('message', messageListener)
      worker.addEventListener('error', errorListener)
    }
    return worker
  }

  /**
   * Wait for a specific unified protocol message type, filtered by requestId.
   * If `signal` is provided and aborts, sends a `cancel` message to the
   * worker and rejects with `InferenceAbortError`.
   */
  function waitForMessage<T = any>(
    w: Worker,
    requestId: string,
    targetType: string,
    timeout: number,
    onOther?: (data: any) => void,
    signal?: AbortSignal,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      let abortListener: (() => void) | null = null
      let handler: (event: MessageEvent) => void

      const cleanup = (): void => {
        if (timeoutId !== undefined)
          clearTimeout(timeoutId)
        w.removeEventListener('message', handler)
        if (abortListener && signal)
          signal.removeEventListener('abort', abortListener)
      }

      handler = (event: MessageEvent): void => {
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
          onOther?.(event.data)
        }
      }

      w.addEventListener('message', handler)

      timeoutId = setTimeout(() => {
        cleanup()
        reject(new Error(`Whisper: timeout after ${timeout}ms waiting for '${targetType}'`))
      }, timeout)

      if (signal) {
        if (signal.aborted) {
          cleanup()
          w.postMessage({ type: 'cancel', requestId: createRequestId(), targetRequestId: requestId })
          reject(new InferenceAbortError(typeof signal.reason === 'string' ? signal.reason : undefined))
          return
        }
        abortListener = () => {
          cleanup()
          w.postMessage({ type: 'cancel', requestId: createRequestId(), targetRequestId: requestId })
          const reason = signal.reason
          reject(reason instanceof Error ? reason : new InferenceAbortError(typeof reason === 'string' ? reason : undefined))
        }
        signal.addEventListener('abort', abortListener)
      }
    })
  }

  async function load(
    onProgress?: (p: ProgressPayload) => void,
    options?: { signal?: AbortSignal },
  ): Promise<void> {
    // NOTICE: Proactive WASM promotion after repeated device-loss events.
    // See kokoro.ts for rationale. Whisper always requests 'webgpu' from the
    // caller today, so we only check the promotion threshold.
    const requestedDevice = deviceLossCount >= DEVICE_LOSS_WASM_THRESHOLD ? 'wasm' : 'webgpu'
    if (requestedDevice === 'wasm') {
      console.warn(
        `[WhisperAdapter] ${deviceLossCount} device-loss events recorded, `
        + `promoting load from webgpu to wasm.`,
      )
    }
    throwIfAborted(options?.signal)
    return operationMutex.runExclusive(async () => {
      throwIfAborted(options?.signal)
      state = 'loading'
      updateInferenceStatus(MODEL_NAMES.WHISPER, { state: 'downloading', device: requestedDevice as any })

      return getLoadQueue().enqueue(MODEL_NAMES.WHISPER, LOAD_PRIORITY.ASR, async () => {
        throwIfAborted(options?.signal)
        const w = ensureWorker()
        const requestId = createRequestId()

        const readyPromise = waitForMessage(w, requestId, 'model-ready', LOAD_TIMEOUT, (data) => {
          if (data.type === 'progress' && onProgress) {
            const payload = data.payload
            onProgress({
              phase: payload.phase ?? 'download',
              percent: payload.percent ?? -1,
              message: payload.message,
              file: payload.file,
              loaded: payload.loaded,
              total: payload.total,
            })
          }
        }, options?.signal)

        w.postMessage({ type: 'load-model', requestId, modelId: MODEL_NAMES.WHISPER, device: requestedDevice })

        let readyResponse: any
        try {
          readyResponse = await readyPromise
        }
        catch (error) {
          state = 'error'
          updateInferenceStatus(MODEL_NAMES.WHISPER, { state: 'error' })
          throw error
        }

        // Capture actual device reported by the worker (may fall back to WASM)
        const actualDevice = readyResponse?.device ?? requestedDevice

        // Track GPU memory allocation
        const coordinator = getGPUCoordinator()
        if (allocationToken)
          coordinator.release(allocationToken)
        allocationToken = coordinator.requestAllocation(
          MODEL_NAMES.WHISPER,
          MODEL_VRAM_ESTIMATES[MODEL_NAMES.WHISPER] ?? 800 * 1024 * 1024,
        )

        lastManifest = { device: actualDevice }
        state = 'ready'
        updateInferenceStatus(MODEL_NAMES.WHISPER, { state: 'ready', device: actualDevice })
        onSuccess()
      }, { signal: options?.signal })
    })
  }

  async function transcribe(
    input: WhisperTranscribeInput,
    options?: { signal?: AbortSignal },
  ): Promise<string> {
    throwIfAborted(options?.signal)
    return defaultPerfTracer.withMeasure('inference', 'whisper-transcribe', () => operationMutex.runExclusive(async () => {
      throwIfAborted(options?.signal)
      if (!worker || state !== 'ready')
        throw new Error('Model not loaded. Call load() first.')

      state = 'transcribing'
      const requestId = createRequestId()

      const resultPromise = waitForMessage<any>(
        worker,
        requestId,
        'inference-result',
        TRANSCRIBE_TIMEOUT,
        undefined,
        options?.signal,
      )

      worker.postMessage({
        type: 'run-inference',
        requestId,
        input: {
          audio: input.audio,
          audioFloat32: input.audioFloat32,
          language: input.language,
        },
      })

      try {
        const result = await resultPromise
        state = 'ready'
        onSuccess()
        return result.output?.text?.[0] ?? ''
      }
      catch (error) {
        state = 'error'
        throw error
      }
    }), { language: input.language })
  }

  function terminateAdapter(): void {
    operationMutex.cancel()
    destroyWorker()
    if (allocationToken) {
      removeInferenceStatus(MODEL_NAMES.WHISPER)
      getGPUCoordinator().release(allocationToken)
      allocationToken = null
    }
    messageHandlers.clear()
    state = 'terminated'
  }

  function onMessage(handler: (event: WhisperEvent) => void): () => void {
    messageHandlers.add(handler)
    return () => messageHandlers.delete(handler)
  }

  return {
    load,
    transcribe,
    terminate: terminateAdapter,
    onMessage,
    get state() { return state },
    get manifest() { return lastManifest },
    get deviceLossCount() { return deviceLossCount },
  }
}

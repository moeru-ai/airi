/**
 * Whisper ASR inference adapter.
 *
 * Talks to the Whisper worker over the Eventa inference contract
 * (`libs/inference/contract.ts`): load and transcribe are both server-streaming
 * invokes (load emits progress then a terminal `ready`; transcribe emits
 * per-token progress then a terminal `result`). The `onMessage` API is
 * preserved by re-emitting `WhisperEvent`s as the streams are consumed. All
 * resilience policy (device-loss restart, load serialization, GPU accounting,
 * mutex) lives here on the main thread.
 */

import type { AllocationToken } from '../gpu-resource-coordinator'
import type { ProgressPayload } from '../protocol'

import { defineStreamInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/webworkers'
import { errorMessageFrom } from '@moeru/std'
import { defaultPerfTracer } from '@proj-airi/stage-shared'
import { Mutex } from 'async-mutex'

import { removeInferenceStatus, updateInferenceStatus } from '../../../composables/use-inference-status'
import { DEVICE_LOSS_WASM_THRESHOLD, MAX_RESTARTS, MODEL_NAMES, RESTART_DELAY_MS, TIMEOUTS } from '../constants'
import { consumeLoadStream, signalWithTimeout, whisperLoadEvent, whisperTranscribeEvent } from '../contract'
import { getGPUCoordinator, getLoadQueue, MODEL_VRAM_ESTIMATES } from '../coordinator'
import { LOAD_PRIORITY } from '../load-queue'
import { classifyDeviceLossReason, classifyError, InferenceAbortError, throwIfAborted } from '../protocol'

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

const LOAD_TIMEOUT = TIMEOUTS.WHISPER_LOAD
const TRANSCRIBE_TIMEOUT = TIMEOUTS.WHISPER_TRANSCRIBE

/**
 * Bind the Eventa invoke clients to a freshly created worker. Returns the
 * load and transcribe (both server-streaming) callables; the rpc type is
 * inferred so call sites stay aligned with the library's option shapes.
 */
function createWhisperRpc(worker: Worker) {
  const { context } = createContext(worker)
  return {
    load: defineStreamInvoke(context, whisperLoadEvent),
    transcribe: defineStreamInvoke(context, whisperTranscribeEvent),
  }
}

type WhisperRpc = ReturnType<typeof createWhisperRpc>

export function createWhisperAdapter(workerUrl: string | URL): WhisperAdapter {
  let worker: Worker | null = null
  let rpc: WhisperRpc | null = null
  let state: WhisperState = 'idle'
  let allocationToken: AllocationToken | null = null
  let restartAttempts = 0
  let errorListener: ((event: ErrorEvent) => void) | null = null
  // NOTICE: Re-entrancy guard for handleWorkerError. A single fatal worker
  // ErrorEvent reaches the adapter twice (native 'error' listener + Eventa's
  // worker.onerror rejecting the in-flight invoke); see handleWorkerError.
  let handlingError = false
  const messageHandlers = new Set<(event: WhisperEvent) => void>()

  // NOTICE: Device-loss resilience state. See kokoro.ts for rationale.
  let lastManifest: { device: string } | null = null
  let deviceLossCount = 0

  const operationMutex = new Mutex()

  function emit(event: WhisperEvent): void {
    for (const handler of messageHandlers) handler(event)
  }

  function handleWorkerError(event: ErrorEvent | Error): void {
    // NOTICE:
    // Idempotency guard: a single worker death must be handled exactly once.
    // This adapter has two observers that can each call here — the native
    // 'error' listener (ensureWorker) and the operation `.catch` (load) when an
    // invoke rejects with a non-abort error. Under @moeru/eventa@1.0.0-beta.5,
    // stream invokes (load/transcribe) do NOT reject on a fatal worker error
    // (only the native listener fires), so the two paths don't currently
    // overlap here. The guard keeps handleWorkerError idempotent regardless,
    // mirroring kokoro.ts where the unary `generate` invoke DOES reject
    // in-flight on a worker error and genuinely reaches here twice for one
    // crash. Without it, one device loss would advance the restart counter and
    // device-loss accounting twice, hitting MAX_RESTARTS after half the real
    // failures. The flag is cleared when a fresh worker is created (ensureWorker).
    // Removal condition: drop only if this adapter is guaranteed a single caller
    // per worker death (e.g. the operation `.catch` stops routing here).
    if (handlingError)
      return
    handlingError = true

    state = 'error'
    operationMutex.cancel()

    const error = event instanceof Error ? event : (event as ErrorEvent).error ?? event
    const code = classifyError(error)
    if (code === 'DEVICE_LOST') {
      deviceLossCount++
      getGPUCoordinator().recordDeviceLoss({
        modelId: MODEL_NAMES.WHISPER,
        reason: classifyDeviceLossReason(error),
        occurredAt: Date.now(),
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
    rpc = null
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
      rpc = createWhisperRpc(worker)
      // Fresh worker lifecycle: re-arm the error guard so the next crash is handled.
      handlingError = false
      // NOTICE: device-loss telemetry + restart. Eventa already rejects in-flight
      // invokes on a fatal worker error (it sets `worker.onerror`); this native
      // 'error' listener coexists with it and owns the resilience policy the
      // adapter is responsible for, mirroring the pre-Eventa error listener.
      errorListener = (event: ErrorEvent) => handleWorkerError(event)
      worker.addEventListener('error', errorListener)
    }
    return worker
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
        ensureWorker()
        if (!rpc)
          throw new Error('Whisper worker not initialized')

        const stream = rpc.load(
          { device: requestedDevice },
          // NOTICE:
          // `raw: {}` satisfies @moeru/eventa@1.0.0-beta.5's stream-invoke
          // options type, which over-includes the inbound emit metadata (`raw`)
          // as a required caller option (asymmetric with unary `defineInvoke`).
          // It is ignored on the send path; only `signal` is consumed.
          // Removal condition: drop when the upstream stream-invoke option type
          // stops requiring `raw` (track @moeru/eventa releases past 1.0.0-beta.5).
          { signal: signalWithTimeout(options?.signal, LOAD_TIMEOUT), raw: {} },
        )

        let info
        try {
          info = await consumeLoadStream(stream, (progress) => {
            updateInferenceStatus(MODEL_NAMES.WHISPER, { progress })
            // Spread to satisfy the WhisperEvent progress variant's
            // `ProgressPayload & Record<string, unknown>` (load progress carries
            // no extras; transcribe progress rides the extras on the contract item).
            emit({ type: 'progress', payload: { ...progress } })
            onProgress?.(progress)
          }).catch((error) => {
            // Normalize caller-driven aborts to InferenceAbortError so the outer
            // catch (and callers) see name === 'AbortError'.
            if (options?.signal?.aborted)
              throw new InferenceAbortError(typeof options.signal.reason === 'string' ? options.signal.reason : undefined)
            throw error
          })
        }
        catch (error) {
          state = 'error'
          updateInferenceStatus(MODEL_NAMES.WHISPER, { state: 'error' })
          if ((error as Error)?.name !== 'AbortError')
            emit({ type: 'error', payload: { code: classifyError(error, 'load'), message: errorMessageFrom(error) ?? 'Whisper load failed' } })
          throw error
        }

        const actualDevice = info.device

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
        emit({ type: 'model-ready' })
        onSuccess()
      }, { signal: options?.signal })
    }).catch((error) => {
      // Don't route AbortError through handleWorkerError — cancellation is
      // not a worker failure and shouldn't trigger restart logic.
      if ((error as Error)?.name === 'AbortError')
        throw error
      handleWorkerError(error instanceof Error ? error : new Error(String(error)))
      throw error
    })
  }

  async function transcribe(
    input: WhisperTranscribeInput,
    options?: { signal?: AbortSignal },
  ): Promise<string> {
    throwIfAborted(options?.signal)
    return defaultPerfTracer.withMeasure('inference', 'whisper-transcribe', () => operationMutex.runExclusive(async () => {
      throwIfAborted(options?.signal)
      if (!worker || !rpc || state !== 'ready')
        throw new Error('Model not loaded. Call load() first.')

      state = 'transcribing'

      const stream = rpc.transcribe(
        {
          audio: input.audio,
          audioFloat32: input.audioFloat32,
          language: input.language,
        },
        // NOTICE:
        // `raw: {}` satisfies @moeru/eventa@1.0.0-beta.5's stream-invoke
        // options type, which over-includes the inbound emit metadata (`raw`)
        // as a required caller option (asymmetric with unary `defineInvoke`).
        // It is ignored on the send path; only `signal` is consumed.
        // Removal condition: drop when the upstream stream-invoke option type
        // stops requiring `raw` (track @moeru/eventa releases past 1.0.0-beta.5).
        { signal: signalWithTimeout(options?.signal, TRANSCRIBE_TIMEOUT), raw: {} },
      )

      try {
        let text: string[] = []
        let sawResult = false
        for await (const item of stream) {
          if (item.kind === 'progress') {
            emit({ type: 'progress', payload: item.payload })
          }
          else {
            text = item.text
            sawResult = true
          }
        }

        // NOTICE: The transcribe contract guarantees exactly one terminal
        // `result` item (see WhisperTranscribeItem in contract.ts). If the
        // stream closes without it (worker-side cancel/early return, transport
        // close), an empty `text` is a dropped result, NOT a valid blank
        // transcription — resolving with '' would hide the failure. The
        // pre-Eventa adapter rejected/timed out in this case rather than
        // returning empty text. Mirrors consumeLoadStream's `ready` check.
        if (!sawResult)
          throw new Error('inference: whisper transcribe stream ended without a result')

        const output = text[0] ?? ''
        emit({ type: 'inference-result', output: { text } })
        state = 'ready'
        onSuccess()
        return output
      }
      catch (error) {
        // Match the pre-Eventa adapter: any transcribe failure (including
        // abort) leaves the adapter in 'error' until the next load().
        state = 'error'
        if (options?.signal?.aborted)
          throw new InferenceAbortError(typeof options.signal.reason === 'string' ? options.signal.reason : undefined)
        emit({ type: 'error', payload: { code: classifyError(error, 'inference'), message: errorMessageFrom(error) ?? 'Whisper transcribe failed' } })
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

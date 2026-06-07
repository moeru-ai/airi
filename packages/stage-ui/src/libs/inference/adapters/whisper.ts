/**
 * Whisper ASR inference adapter.
 *
 * Talks to the Whisper worker over the Eventa inference contract
 * (`libs/inference/contract.ts`): load and transcribe are both server-streaming
 * invokes (load emits progress then a terminal `ready`; transcribe emits
 * per-token progress then a terminal `result`). The `onMessage` API is
 * preserved by re-emitting `WhisperEvent`s as the streams are consumed. Worker
 * lifecycle and device-loss resilience are delegated to {@link createGpuWorkerHost};
 * this module owns the Whisper contract, the transcribe stream shape, and UI emission.
 */

import type { ProgressPayload } from '../protocol'

import { defineStreamInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/webworkers'
import { errorMessageFrom } from '@moeru/std'
import { defaultPerfTracer } from '@proj-airi/stage-shared'
import { Mutex } from 'async-mutex'

import { removeInferenceStatus, updateInferenceStatus } from '../../../composables/use-inference-status'
import { MODEL_NAMES, TIMEOUTS } from '../constants'
import { consumeLoadStream, createIdleTimeout, signalWithTimeout, whisperLoadEvent, whisperTranscribeEvent } from '../contract'
import { MODEL_VRAM_ESTIMATES } from '../coordinator'
import { GPU_PRIORITY } from '../gpu-executor'
import { createGpuWorkerHost } from '../gpu-worker-host'
import { classifyError, InferenceAbortError, InferenceTimeoutError, throwIfAborted } from '../protocol'

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
   * Pass `options.model` (a Hugging Face repo) to select a model size; omit to
   * keep / use the built-in default. Switching models reloads the worker pipeline.
   */
  load: (
    onProgress?: (p: ProgressPayload) => void,
    options?: { signal?: AbortSignal, model?: string },
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
   * `device` reflects what the worker actually used (post-fallback); `model` is
   * the loaded model repo (used to detect when a different model is requested).
   */
  readonly manifest: { device: string, model?: string } | null

  /** Number of WebGPU device-loss events observed by this adapter */
  readonly deviceLossCount: number
}

const LOAD_TIMEOUT = TIMEOUTS.WHISPER_LOAD
const TRANSCRIBE_FIRST_CHUNK_TIMEOUT = TIMEOUTS.WHISPER_TRANSCRIBE_FIRST_CHUNK
const TRANSCRIBE_IDLE_TIMEOUT = TIMEOUTS.WHISPER_TRANSCRIBE_IDLE

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

/**
 * Create a Whisper adapter.
 *
 * @param workerUrl - Override the worker entry (used by tests). Omit in
 *   production so the bundler resolves the worker via the inline
 *   `new Worker(new URL(...))` pattern below — splitting that pattern across a
 *   variable would defeat Vite's static worker detection.
 */
export function createWhisperAdapter(workerUrl?: string | URL): WhisperAdapter {
  const messageHandlers = new Set<(event: WhisperEvent) => void>()
  // `device` reflects what the worker actually used (post-fallback); `model` is
  // the loaded repo. Adapter-owned since the host has no notion of Whisper's
  // manifest shape.
  let lastManifest: { device: string, model?: string } | null = null

  function emit(event: WhisperEvent): void {
    for (const handler of messageHandlers) handler(event)
  }

  const host = createGpuWorkerHost<WhisperRpc>({
    modelId: MODEL_NAMES.WHISPER,
    createWorker: () => workerUrl != null
      ? new Worker(workerUrl, { type: 'module' })
      : new Worker(new URL('../../workers/worker.ts', import.meta.url), { type: 'module' }),
    createRpc: createWhisperRpc,
    onTerminate: () => {
      removeInferenceStatus(MODEL_NAMES.WHISPER)
      messageHandlers.clear()
    },
  })

  async function load(
    onProgress?: (p: ProgressPayload) => void,
    options?: { signal?: AbortSignal, model?: string },
  ): Promise<void> {
    // NOTICE: Proactive WASM promotion after repeated device-loss events.
    // Whisper always requests 'webgpu' from the caller today.
    const requestedDevice = host.promoteDevice('webgpu')
    throwIfAborted(options?.signal)
    return host.runExclusive(async () => {
      throwIfAborted(options?.signal)
      host.setPhase('loading')
      updateInferenceStatus(MODEL_NAMES.WHISPER, { state: 'downloading', device: requestedDevice as any })

      return host.runOnGpu(MODEL_NAMES.WHISPER, GPU_PRIORITY.STT_LOAD, options?.signal, async ({ crashSignal }) => {
        throwIfAborted(options?.signal)
        const rpc = host.ensure()

        const stream = rpc.load(
          { device: requestedDevice, model: options?.model },
          { signal: AbortSignal.any([signalWithTimeout(options?.signal, LOAD_TIMEOUT), crashSignal]) },
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
          host.setPhase('error')
          updateInferenceStatus(MODEL_NAMES.WHISPER, { state: 'error' })
          if ((error as Error)?.name !== 'AbortError')
            emit({ type: 'error', payload: { code: classifyError(error, 'load'), message: errorMessageFrom(error) ?? 'Whisper load failed' } })
          throw error
        }

        const actualDevice = info.device

        host.allocate(MODEL_NAMES.WHISPER, MODEL_VRAM_ESTIMATES[MODEL_NAMES.WHISPER] ?? 800 * 1024 * 1024)

        // The worker echoes the model it actually loaded back via metadata.
        lastManifest = { device: actualDevice, model: info.metadata?.model as string | undefined }
        host.setPhase('ready')
        updateInferenceStatus(MODEL_NAMES.WHISPER, { state: 'ready', device: actualDevice })
        emit({ type: 'model-ready' })
        host.recordSuccess()
      })
    }).catch((error) => {
      // Don't route AbortError through handleWorkerError — cancellation is
      // not a worker failure and shouldn't trigger restart logic.
      if ((error as Error)?.name === 'AbortError')
        throw error
      host.handleWorkerError(error instanceof Error ? error : new Error(String(error)))
      throw error
    })
  }

  async function transcribe(
    input: WhisperTranscribeInput,
    options?: { signal?: AbortSignal },
  ): Promise<string> {
    throwIfAborted(options?.signal)

    // Load-on-demand recovery: a wedge/crash restart respawns a bare worker
    // ('idle'). Whisper is loaded lazily by design (~800 MB, never preloaded),
    // so recover the same way — re-acquire the model on the next transcribe
    // rather than eagerly after the restart. `lastManifest` flags a prior load.
    // Done before runExclusive — load() takes the same host mutex, so calling it
    // inside this runExclusive would deadlock. Replay the model that was loaded so
    // recovery restores the user's selected size, not the default.
    if (host.phase === 'idle' && lastManifest)
      await load(undefined, { signal: options?.signal, model: lastManifest.model })

    return defaultPerfTracer.withMeasure('inference', 'whisper-transcribe', () => host.runExclusive(async () => {
      throwIfAborted(options?.signal)
      if (!host.rpc || host.phase !== 'ready')
        throw new Error('Model not loaded. Call load() first.')

      host.setPhase('busy')

      // Two-tier inactivity timeout: a generous first-output budget (encode +
      // first token) then a tighter inter-token gap once the worker has proven
      // alive. A wedged worker is restarted (via the outer catch); a
      // long-but-progressing transcription resets it on each streamed item.
      const idle = createIdleTimeout(TRANSCRIBE_FIRST_CHUNK_TIMEOUT, TRANSCRIBE_IDLE_TIMEOUT)

      // The stream holds the GPU slot for the whole transcription, yielding it
      // between progress chunks so a higher-priority op (e.g. a queued TTS
      // generate) can preempt. `crashSignal` ends the stream on worker death so
      // the slot frees immediately instead of stalling it.
      let text: string[] = []
      try {
        text = await host.runOnGpu(MODEL_NAMES.WHISPER, GPU_PRIORITY.STT_TRANSCRIBE, options?.signal, async ({ slot, crashSignal }) => {
          const signals = [idle.signal, crashSignal]
          if (options?.signal)
            signals.push(options.signal)
          const stream = host.rpc!.transcribe(
            {
              audio: input.audio,
              audioFloat32: input.audioFloat32,
              language: input.language,
            },
            { signal: AbortSignal.any(signals) },
          )

          let collected: string[] = []
          let sawResult = false
          for await (const item of stream) {
            idle.reset()
            if (item.kind === 'progress') {
              emit({ type: 'progress', payload: item.payload })
              // Cooperative preemption point: between per-token chunks, let a
              // higher-priority unit (e.g. a queued TTS generate) take the GPU.
              await slot.yield()
            }
            else {
              collected = item.text
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

          return collected
        })
      }
      catch (error) {
        // Match the pre-Eventa adapter: any transcribe failure leaves the
        // adapter in 'error' until the next load(). A worker crash is handled
        // separately by the host's native 'error' listener.
        host.setPhase('error')
        // Caller cancellation is request-level: surface AbortError and do not
        // restart (the outer catch restarts only on a wedge). Checked first so
        // cancelling a wedged worker never restarts it.
        if (options?.signal?.aborted)
          throw new InferenceAbortError(typeof options.signal.reason === 'string' ? options.signal.reason : undefined)
        // Inactivity timeout: worker presumed wedged. Surface a TimeoutError so
        // the outer catch routes it through host.handleWorkerError (restart).
        if (idle.signal.aborted) {
          const timeoutError = idle.signal.reason instanceof Error ? idle.signal.reason : new InferenceTimeoutError()
          emit({ type: 'error', payload: { code: 'TIMEOUT', message: errorMessageFrom(timeoutError) ?? 'Whisper transcribe timed out' } })
          throw timeoutError
        }
        emit({ type: 'error', payload: { code: classifyError(error, 'inference'), message: errorMessageFrom(error) ?? 'Whisper transcribe failed' } })
        throw error
      }
      finally {
        idle.clear()
      }

      const output = text[0] ?? ''
      emit({ type: 'inference-result', output: { text } })
      host.setPhase('ready')
      host.recordSuccess()
      return output
    }), { language: input.language }).catch((error) => {
      // Only an inactivity timeout restarts the worker (presumed wedged). Caller
      // aborts and other transcribe failures leave the adapter in 'error' for the
      // next load(), matching whisper's pre-existing recovery model.
      if ((error as Error)?.name === 'TimeoutError')
        host.handleWorkerError(error instanceof Error ? error : new Error(String(error)))
      throw error
    })
  }

  function onMessage(handler: (event: WhisperEvent) => void): () => void {
    messageHandlers.add(handler)
    return () => messageHandlers.delete(handler)
  }

  return {
    load,
    transcribe,
    terminate: host.terminate,
    onMessage,
    get state() { return host.phase === 'busy' ? 'transcribing' : host.phase },
    get manifest() { return lastManifest },
    get deviceLossCount() { return host.deviceLossCount },
  }
}

let globalAdapter: WhisperAdapter | null = null
const singletonMutex = new Mutex()

/**
 * Get the global Whisper adapter instance, bound to the bundled worker.
 *
 * Creates and starts the worker on first call. Automatically re-creates the
 * adapter if it has entered a terminal state ('terminated' or 'error' after max
 * restarts exhausted), mirroring {@link getKokoroAdapter}.
 */
export async function getWhisperAdapter(): Promise<WhisperAdapter> {
  return singletonMutex.runExclusive(async () => {
    if (
      !globalAdapter
      || globalAdapter.state === 'terminated'
      || globalAdapter.state === 'error'
    ) {
      // Dispose the dead instance before replacing it: terminate() cancels any
      // pending restart timer so the discarded adapter can't spawn an orphan
      // worker after we drop our reference to it.
      globalAdapter?.terminate()
      globalAdapter = createWhisperAdapter()
    }
    return globalAdapter
  })
}

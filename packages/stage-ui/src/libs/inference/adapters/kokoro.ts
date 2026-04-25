/**
 * Kokoro TTS inference adapter.
 *
 * Uses the unified inference protocol from protocol.ts.
 * The worker now speaks the same protocol — no translation layer needed.
 */

import type { VoiceKey, Voices } from '../../../workers/kokoro/types'
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

export interface KokoroAdapter {
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

  /** Terminate the worker */
  terminate: () => void

  /** Current state */
  readonly state: 'idle' | 'loading' | 'ready' | 'running' | 'error' | 'terminated'

  /**
   * Snapshot of the last successful load config, or null if never loaded.
   * `device` reflects the device actually used (post WASM promotion / worker
   * fallback), which may differ from the device requested by the caller.
   */
  readonly manifest: { quantization: string, device: string } | null

  /** Number of WebGPU device-loss events observed by this adapter */
  readonly deviceLossCount: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOAD_MODEL_TIMEOUT = TIMEOUTS.KOKORO_LOAD
const GENERATE_TIMEOUT = TIMEOUTS.KOKORO_GENERATE

// ---------------------------------------------------------------------------
// Audio Encoding
// ---------------------------------------------------------------------------

/**
 * Encode raw PCM Float32Array samples into a WAV ArrayBuffer.
 * This runs on the main thread — intentionally lightweight (just header + int16 conversion).
 */
function encodeWav(samples: Float32Array, sampleRate: number, numChannels = 1): ArrayBuffer {
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const dataLength = samples.length * bytesPerSample
  const headerLength = 44
  const buffer = new ArrayBuffer(headerLength + dataLength)
  const view = new DataView(buffer)

  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeString(view, 8, 'WAVE')

  // fmt chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true) // byte rate
  view.setUint16(32, numChannels * bytesPerSample, true) // block align
  view.setUint16(34, bitsPerSample, true)

  // data chunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataLength, true)

  // Convert Float32 [-1, 1] to Int16
  const output = new Int16Array(buffer, headerLength)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
  }

  return buffer
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

    const cleanup = (): void => {
      if (timeoutId !== undefined)
        clearTimeout(timeoutId)
      worker.removeEventListener('message', handler)
      if (abortListener && signal)
        signal.removeEventListener('abort', abortListener)
    }

    const handler = (event: MessageEvent): void => {
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
        worker.postMessage({ type: 'cancel', requestId: createRequestId(), targetRequestId: requestId })
        reject(new InferenceAbortError(typeof signal.reason === 'string' ? signal.reason : undefined))
        return
      }
      abortListener = () => {
        cleanup()
        worker.postMessage({ type: 'cancel', requestId: createRequestId(), targetRequestId: requestId })
        const reason = signal.reason
        reject(reason instanceof Error ? reason : new InferenceAbortError(typeof reason === 'string' ? reason : undefined))
      }
      signal.addEventListener('abort', abortListener)
    }
  })
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

interface KokoroManifest {
  quantization: string
  device: string
}

export function createKokoroAdapter(): KokoroAdapter {
  let worker: Worker | null = null
  let state: KokoroAdapter['state'] = 'idle'
  let voices: Voices | null = null
  let restartAttempts = 0
  let allocationToken: AllocationToken | null = null
  let currentModelStatusId: string | null = null
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

  function handleWorkerError(event: ErrorEvent | Error): void {
    state = 'error'
    operationMutex.cancel()

    // Record device-loss telemetry before teardown so the coordinator sees it
    // even if the adapter is never used again.
    const code = classifyError(event instanceof Error ? event : (event as ErrorEvent).error ?? event)
    if (code === 'DEVICE_LOST') {
      deviceLossCount++
      getGPUCoordinator().recordDeviceLoss({
        modelId: currentModelStatusId ?? MODEL_NAMES.KOKORO,
        reason: classifyDeviceLossReason(event instanceof Error ? event : (event as ErrorEvent).error ?? event),
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

      updateInferenceStatus(modelStatusId, { state: 'downloading', device: effectiveDevice as any })

      // Use the global load queue to serialize model loads across all adapters
      return getLoadQueue().enqueue(modelStatusId, LOAD_PRIORITY.TTS, async () => {
        throwIfAborted(options?.signal)
        const requestId = createRequestId()
        // Signal is also passed to the queue below for pending-entry removal

        const readyPromise = waitForWorkerMessage<any>(worker!, requestId, 'model-ready', LOAD_MODEL_TIMEOUT, (data) => {
          if (data.type === 'progress') {
            const payload = data.payload
            const progress: ProgressPayload = {
              phase: payload.phase ?? 'download',
              percent: payload.percent ?? -1,
              message: payload.message,
              file: payload.file,
              loaded: payload.loaded,
              total: payload.total,
            }
            // Update reactive inference status
            updateInferenceStatus(modelStatusId, { progress })
            options?.onProgress?.(progress)
          }
        }, options?.signal)

        worker!.postMessage({
          type: 'load-model',
          requestId,
          modelId: MODEL_NAMES.KOKORO,
          device: effectiveDevice,
          dtype: quantization,
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
        lastManifest = { quantization, device: (response.device ?? effectiveDevice) as string }

        state = 'ready'
        updateInferenceStatus(modelStatusId, { state: 'ready', device: (response.device ?? effectiveDevice) as any })
        onSuccess()
        if (!voices)
          throw new Error('Kokoro worker did not return voice metadata')
        return voices
      }, { signal: options?.signal })
    }), { quantization, device: effectiveDevice }).catch((error) => {
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
    return defaultPerfTracer.withMeasure('inference', 'kokoro-generate', () => operationMutex.runExclusive(async () => {
      throwIfAborted(options?.signal)
      if (!worker)
        throw new Error('Worker not initialized. Call loadModel() first.')

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
        type: 'run-inference',
        requestId,
        input: { action: 'generate', text, voice },
      })

      const response = await resultPromise
      const output = response.output

      if (output.action === 'generate') {
        state = 'ready'
        onSuccess()
        return encodeWav(output.samples as Float32Array, output.samplingRate as number)
      }

      const errorCode = classifyError(new Error('Unexpected output action'))
      throw new Error(`[${errorCode}] Unexpected output action: ${output.action}`)
    }), { text: text.slice(0, 50), voice }).catch((error) => {
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
    loadModel,
    generate,
    getVoices,
    terminate: terminateAdapter,
    get state() { return state },
    get manifest() { return lastManifest },
    get deviceLossCount() { return deviceLossCount },
  }
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

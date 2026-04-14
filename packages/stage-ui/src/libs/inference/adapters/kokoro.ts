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
import { MAX_RESTARTS, MODEL_NAMES, RESTART_DELAY_MS, TIMEOUTS } from '../constants'
import { getGPUCoordinator, getLoadQueue, MODEL_VRAM_ESTIMATES } from '../coordinator'
import { LOAD_PRIORITY } from '../load-queue'
import { classifyError, createRequestId } from '../protocol'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface KokoroAdapter {
  /** Load a TTS model with the given quantization and device */
  loadModel: (
    quantization: string,
    device: string,
    options?: { onProgress?: (p: ProgressPayload) => void },
  ) => Promise<Voices>

  /** Generate speech audio from text */
  generate: (text: string, voice: VoiceKey) => Promise<ArrayBuffer>

  /** Get the voices from the last loaded model */
  getVoices: () => Voices

  /** Terminate the worker */
  terminate: () => void

  /** Current state */
  readonly state: 'idle' | 'loading' | 'ready' | 'running' | 'error' | 'terminated'
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
 */
function waitForWorkerMessage<T = any>(
  worker: Worker,
  requestId: string,
  targetType: string,
  timeout: number,
  callback?: (data: any) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const handler = (event: MessageEvent) => {
      if (event.data.requestId !== requestId)
        return

      if (event.data.type === targetType) {
        if (timeoutId !== undefined)
          clearTimeout(timeoutId)
        worker.removeEventListener('message', handler)
        resolve(event.data as T)
      }
      else if (event.data.type === 'error') {
        if (timeoutId !== undefined)
          clearTimeout(timeoutId)
        worker.removeEventListener('message', handler)
        reject(new Error(event.data.payload?.message ?? 'Worker error'))
      }
      else {
        callback?.(event.data)
      }
    }

    worker.addEventListener('message', handler)

    timeoutId = setTimeout(() => {
      worker.removeEventListener('message', handler)
      reject(new Error(`Kokoro: timeout after ${timeout}ms waiting for '${targetType}'`))
    }, timeout)
  })
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createKokoroAdapter(): KokoroAdapter {
  let worker: Worker | null = null
  let state: KokoroAdapter['state'] = 'idle'
  let voices: Voices | null = null
  let restartAttempts = 0
  let allocationToken: AllocationToken | null = null
  let currentModelStatusId: string | null = null

  const operationMutex = new Mutex()
  const lifecycleMutex = new Mutex()

  function initializeWorker(): void {
    worker = new Worker(
      new URL('../../../workers/kokoro/worker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.addEventListener('error', handleWorkerError)
  }

  function handleWorkerError(_event: ErrorEvent | Error): void {
    state = 'error'
    operationMutex.cancel()
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
    if (restartAttempts >= MAX_RESTARTS) {
      console.error(
        `[KokoroAdapter] Max restart attempts (${MAX_RESTARTS}) reached.`,
      )
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
    options?: { onProgress?: (p: ProgressPayload) => void },
  ): Promise<Voices> {
    await ensureStarted()

    return defaultPerfTracer.withMeasure('inference', 'kokoro-load-model', () => operationMutex.runExclusive(async () => {
      state = 'loading'
      const modelStatusId = `kokoro-${quantization}`

      // Clear previous model status when switching models
      if (currentModelStatusId && currentModelStatusId !== modelStatusId)
        removeInferenceStatus(currentModelStatusId)
      currentModelStatusId = modelStatusId

      updateInferenceStatus(modelStatusId, { state: 'downloading', device: device as any })

      // Use the global load queue to serialize model loads across all adapters
      return getLoadQueue().enqueue(modelStatusId, LOAD_PRIORITY.TTS, async () => {
        const requestId = createRequestId()

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
        })

        worker!.postMessage({
          type: 'load-model',
          requestId,
          modelId: MODEL_NAMES.KOKORO,
          device,
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

        state = 'ready'
        updateInferenceStatus(modelStatusId, { state: 'ready', device: (response.device ?? device) as any })
        onSuccess()
        return voices!
      })
    }), { quantization, device }).catch((error) => {
      handleWorkerError(error instanceof Error ? error : new Error(String(error)))
      throw error
    })
  }

  async function generate(text: string, voice: VoiceKey): Promise<ArrayBuffer> {
    return defaultPerfTracer.withMeasure('inference', 'kokoro-generate', () => operationMutex.runExclusive(async () => {
      if (!worker)
        throw new Error('Worker not initialized. Call loadModel() first.')

      // Update LRU timestamp for memory pressure tracking
      if (allocationToken)
        getGPUCoordinator().touch(allocationToken.modelId)

      state = 'running'
      const requestId = createRequestId()

      const resultPromise = waitForWorkerMessage<any>(worker, requestId, 'inference-result', GENERATE_TIMEOUT)

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
 */
export async function getKokoroAdapter(): Promise<KokoroAdapter> {
  return singletonMutex.runExclusive(async () => {
    if (!globalAdapter)
      globalAdapter = createKokoroAdapter()
    return globalAdapter
  })
}

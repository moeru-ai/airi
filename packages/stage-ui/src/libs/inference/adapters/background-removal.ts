/**
 * Background removal inference adapter.
 *
 * Offloads Xenova/modnet inference to a Web Worker so the main
 * thread is not blocked during image processing.
 * Uses the unified inference protocol from protocol.ts.
 */

import type { AllocationToken } from '../gpu-resource-coordinator'
import type { ProgressPayload } from '../protocol'

import { defaultPerfTracer } from '@proj-airi/stage-shared'
import { Mutex } from 'async-mutex'

import { removeInferenceStatus, updateInferenceStatus } from '../../../composables/use-inference-status'
import { MODEL_IDS, MODEL_NAMES, TIMEOUTS } from '../constants'
import { getGPUCoordinator, getLoadQueue, MODEL_VRAM_ESTIMATES } from '../coordinator'
import { LOAD_PRIORITY } from '../load-queue'
import { createRequestId, InferenceAbortError, throwIfAborted } from '../protocol'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackgroundRemovalAdapter {
  /**
   * Load the background removal model in the worker.
   * Must be called before `processImage()`.
   * Pass `options.signal` to cancel; rejects with `InferenceAbortError`.
   */
  load: (
    onProgress?: (p: ProgressPayload) => void,
    options?: { signal?: AbortSignal },
  ) => Promise<void>

  /**
   * Remove the background from an image.
   * Returns a new ImageData with the background alpha set to 0.
   * Pass `options.signal` to cancel; rejects with `InferenceAbortError`.
   */
  processImage: (
    imageData: ImageData,
    options?: { signal?: AbortSignal },
  ) => Promise<ImageData>

  /** Terminate the worker */
  terminate: () => void

  /** Current state */
  readonly state: 'idle' | 'loading' | 'ready' | 'processing' | 'error' | 'terminated'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOAD_TIMEOUT = TIMEOUTS.BG_REMOVAL_LOAD
const PROCESS_TIMEOUT = TIMEOUTS.BG_REMOVAL_PROCESS

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBackgroundRemovalAdapter(): BackgroundRemovalAdapter {
  let worker: Worker | null = null
  let state: BackgroundRemovalAdapter['state'] = 'idle'
  let allocationToken: AllocationToken | null = null
  let errorListener: ((event: Event) => void) | null = null

  const operationMutex = new Mutex()

  function destroyWorker(): void {
    if (worker) {
      if (errorListener)
        worker.removeEventListener('error', errorListener)
      errorListener = null
      worker.terminate()
      worker = null
    }
  }

  function ensureWorker(): Worker {
    if (!worker) {
      worker = new Worker(
        new URL('../../../workers/background-removal/worker.ts', import.meta.url),
        { type: 'module' },
      )
      errorListener = (_event: Event) => {
        state = 'error'
        operationMutex.cancel()
      }
      worker.addEventListener('error', errorListener)
    }
    return worker
  }

  /**
   * Wait for a specific message type from the worker, filtered by requestId.
   * Uses the unified protocol message types. Honors `signal` to cancel the
   * wait (and notify the worker to discard the result).
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

      const cleanup = (): void => {
        if (timeoutId !== undefined)
          clearTimeout(timeoutId)
        w.removeEventListener('message', handler)
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
          onOther?.(event.data)
        }
      }

      w.addEventListener('message', handler)

      timeoutId = setTimeout(() => {
        cleanup()
        reject(new Error(`Background removal: timeout after ${timeout}ms`))
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
    throwIfAborted(options?.signal)
    return operationMutex.runExclusive(async () => {
      throwIfAborted(options?.signal)
      state = 'loading'
      updateInferenceStatus(MODEL_NAMES.BG_REMOVAL, { state: 'downloading', device: 'webgpu' })

      return getLoadQueue().enqueue(MODEL_NAMES.BG_REMOVAL, LOAD_PRIORITY.BACKGROUND_REMOVAL, async () => {
        throwIfAborted(options?.signal)
        const w = ensureWorker()
        const requestId = createRequestId()

        const loadedPromise = waitForMessage(w, requestId, 'model-ready', LOAD_TIMEOUT, (data) => {
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

        w.postMessage({ type: 'load-model', requestId, modelId: MODEL_IDS.BG_REMOVAL, device: 'webgpu' })

        let loadedResponse: any
        try {
          loadedResponse = await loadedPromise
        }
        catch (error) {
          state = 'error'
          updateInferenceStatus(MODEL_NAMES.BG_REMOVAL, { state: 'error' })
          throw error
        }

        // Capture actual device reported by the worker (may fall back to WASM)
        const actualDevice = loadedResponse?.device ?? 'webgpu'

        // Track GPU memory allocation
        const coordinator = getGPUCoordinator()
        if (allocationToken)
          coordinator.release(allocationToken)
        allocationToken = coordinator.requestAllocation(
          MODEL_NAMES.BG_REMOVAL,
          MODEL_VRAM_ESTIMATES.modnet ?? 25 * 1024 * 1024,
        )

        state = 'ready'
        updateInferenceStatus(MODEL_NAMES.BG_REMOVAL, { state: 'ready', device: actualDevice })
      }, { signal: options?.signal })
    })
  }

  async function processImage(
    imageData: ImageData,
    options?: { signal?: AbortSignal },
  ): Promise<ImageData> {
    throwIfAborted(options?.signal)
    return defaultPerfTracer.withMeasure('inference', 'bg-removal-process', () => operationMutex.runExclusive(async () => {
      throwIfAborted(options?.signal)
      if (!worker || (state !== 'ready' && state !== 'processing'))
        throw new Error('Model not loaded. Call load() first.')

      state = 'processing'
      const requestId = createRequestId()

      const resultPromise = waitForMessage<any>(
        worker,
        requestId,
        'inference-result',
        PROCESS_TIMEOUT,
        undefined,
        options?.signal,
      )

      // Send raw pixel data (transferable copy)
      const pixelsCopy = new Uint8ClampedArray(imageData.data)
      worker.postMessage(
        {
          type: 'run-inference',
          requestId,
          input: {
            imageData: pixelsCopy,
            width: imageData.width,
            height: imageData.height,
          },
        },
        [pixelsCopy.buffer],
      )

      let result: any
      try {
        result = await resultPromise
      }
      catch (error) {
        state = 'ready'
        throw error
      }

      // Apply mask to original image alpha channel
      const output = new ImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height,
      )
      const maskData = result.output.maskData as Uint8Array
      for (let i = 0; i < maskData.length; i++) {
        output.data[4 * i + 3] = maskData[i]
      }

      state = 'ready'
      return output
    }), { width: imageData.width, height: imageData.height })
  }

  function terminateAdapter(): void {
    operationMutex.cancel()
    destroyWorker()
    if (allocationToken) {
      removeInferenceStatus(MODEL_NAMES.BG_REMOVAL)
      getGPUCoordinator().release(allocationToken)
      allocationToken = null
    }
    state = 'terminated'
  }

  return {
    load,
    processImage,
    terminate: terminateAdapter,
    get state() { return state },
  }
}

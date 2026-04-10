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

import { removeInferenceStatus, updateInferenceStatus } from '../../../composables/use-inference-status'
import { AsyncMutex } from '../async-mutex'
import { getGPUCoordinator, getLoadQueue, MODEL_VRAM_ESTIMATES } from '../coordinator'
import { LOAD_PRIORITY } from '../load-queue'
import { createRequestId } from '../protocol'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackgroundRemovalAdapter {
  /**
   * Load the background removal model in the worker.
   * Must be called before `processImage()`.
   */
  load: (onProgress?: (p: ProgressPayload) => void) => Promise<void>

  /**
   * Remove the background from an image.
   * Returns a new ImageData with the background alpha set to 0.
   */
  processImage: (imageData: ImageData) => Promise<ImageData>

  /** Terminate the worker */
  terminate: () => void

  /** Current state */
  readonly state: 'idle' | 'loading' | 'ready' | 'processing' | 'error' | 'terminated'
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOAD_TIMEOUT = 120_000
const PROCESS_TIMEOUT = 60_000

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBackgroundRemovalAdapter(): BackgroundRemovalAdapter {
  let worker: Worker | null = null
  let state: BackgroundRemovalAdapter['state'] = 'idle'
  let allocationToken: AllocationToken | null = null

  const operationMutex = new AsyncMutex()

  function ensureWorker(): Worker {
    if (!worker) {
      worker = new Worker(
        new URL('../../../workers/background-removal/worker.ts', import.meta.url),
        { type: 'module' },
      )
      worker.addEventListener('error', (event) => {
        state = 'error'
        operationMutex.reset(new Error(event.message ?? 'Worker error'))
      })
    }
    return worker
  }

  /**
   * Wait for a specific message type from the worker, filtered by requestId.
   * Uses the unified protocol message types.
   */
  function waitForMessage<T = any>(
    w: Worker,
    requestId: string,
    targetType: string,
    timeout: number,
    onOther?: (data: any) => void,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined

      const handler = (event: MessageEvent) => {
        if (event.data.requestId !== requestId)
          return

        if (event.data.type === targetType) {
          if (timeoutId !== undefined)
            clearTimeout(timeoutId)
          w.removeEventListener('message', handler)
          resolve(event.data as T)
        }
        else if (event.data.type === 'error') {
          if (timeoutId !== undefined)
            clearTimeout(timeoutId)
          w.removeEventListener('message', handler)
          reject(new Error(event.data.payload?.message ?? 'Worker error'))
        }
        else {
          onOther?.(event.data)
        }
      }

      w.addEventListener('message', handler)

      timeoutId = setTimeout(() => {
        w.removeEventListener('message', handler)
        reject(new Error(`Background removal: timeout after ${timeout}ms`))
      }, timeout)
    })
  }

  async function load(onProgress?: (p: ProgressPayload) => void): Promise<void> {
    return operationMutex.run(async () => {
      state = 'loading'
      updateInferenceStatus('modnet', { state: 'downloading', device: 'webgpu' })

      return getLoadQueue().enqueue('modnet', LOAD_PRIORITY.BACKGROUND_REMOVAL, async () => {
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
        })

        w.postMessage({ type: 'load-model', requestId, modelId: 'Xenova/modnet', device: 'webgpu' })
        await loadedPromise

        // Track GPU memory allocation
        const coordinator = getGPUCoordinator()
        if (allocationToken)
          coordinator.release(allocationToken)
        allocationToken = coordinator.requestAllocation(
          'modnet',
          MODEL_VRAM_ESTIMATES.modnet ?? 25 * 1024 * 1024,
        )

        state = 'ready'
        updateInferenceStatus('modnet', { state: 'ready' })
      })
    })
  }

  async function processImage(imageData: ImageData): Promise<ImageData> {
    return defaultPerfTracer.withMeasure('inference', 'bg-removal-process', () => operationMutex.run(async () => {
      if (!worker || (state !== 'ready' && state !== 'processing'))
        throw new Error('Model not loaded. Call load() first.')

      state = 'processing'
      const requestId = createRequestId()

      const resultPromise = waitForMessage<any>(worker, requestId, 'inference-result', PROCESS_TIMEOUT)

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

      const result = await resultPromise

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
    operationMutex.reset(new Error('Adapter terminated'))
    if (worker) {
      worker.terminate()
      worker = null
    }
    if (allocationToken) {
      removeInferenceStatus('modnet')
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

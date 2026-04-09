/**
 * Background removal inference adapter.
 *
 * Offloads Xenova/modnet inference to a Web Worker so the main
 * thread is not blocked during image processing.
 */

import type { ProgressPayload } from '../protocol'

import { AsyncMutex } from '../async-mutex'

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

let requestCounter = 0
function nextRequestId(): string {
  return `bgr_${(requestCounter++).toString(36)}`
}

export function createBackgroundRemovalAdapter(): BackgroundRemovalAdapter {
  let worker: Worker | null = null
  let state: BackgroundRemovalAdapter['state'] = 'idle'

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

  function waitForMessage(
    w: Worker,
    requestId: string,
    targetType: string,
    timeout: number,
    onOther?: (data: any) => void,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined

      const handler = (event: MessageEvent) => {
        if (event.data.requestId !== requestId)
          return

        if (event.data.type === targetType) {
          if (timeoutId !== undefined)
            clearTimeout(timeoutId)
          w.removeEventListener('message', handler)
          resolve(event.data)
        }
        else if (event.data.type === 'error') {
          if (timeoutId !== undefined)
            clearTimeout(timeoutId)
          w.removeEventListener('message', handler)
          reject(new Error(event.data.message))
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
      const w = ensureWorker()
      const requestId = nextRequestId()

      const loadedPromise = waitForMessage(w, requestId, 'loaded', LOAD_TIMEOUT, (data) => {
        if (data.type === 'progress' && onProgress) {
          onProgress({
            phase: 'download',
            percent: data.progress >= 0 ? Math.round(data.progress) : -1,
            message: data.message,
          })
        }
      })

      w.postMessage({ type: 'load', requestId })
      await loadedPromise
      state = 'ready'
    })
  }

  async function processImage(imageData: ImageData): Promise<ImageData> {
    return operationMutex.run(async () => {
      if (!worker || (state !== 'ready' && state !== 'processing'))
        throw new Error('Model not loaded. Call load() first.')

      state = 'processing'
      const requestId = nextRequestId()

      const resultPromise = waitForMessage(worker, requestId, 'result', PROCESS_TIMEOUT)

      // Send raw pixel data (transferable copy)
      const pixelsCopy = new Uint8ClampedArray(imageData.data)
      worker.postMessage(
        {
          type: 'process',
          requestId,
          imageData: pixelsCopy,
          width: imageData.width,
          height: imageData.height,
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
      const maskData = result.maskData as Uint8Array
      for (let i = 0; i < maskData.length; i++) {
        output.data[4 * i + 3] = maskData[i]
      }

      state = 'ready'
      return output
    })
  }

  function terminateAdapter(): void {
    operationMutex.reset(new Error('Adapter terminated'))
    if (worker) {
      worker.terminate()
      worker = null
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

/**
 * Background removal inference adapter.
 *
 * Offloads Xenova/modnet inference to a Web Worker over the Eventa inference
 * contract (`libs/inference/contract.ts`): load is a server-streaming invoke,
 * process is a unary invoke whose mask buffer is transferred back zero-copy.
 * Load serialization, GPU accounting, and the mutex live here on the main thread.
 */

import type { AllocationToken } from '../gpu-resource-coordinator'
import type { ProgressPayload } from '../protocol'

import { defineInvoke, defineStreamInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/webworkers'
import { defaultPerfTracer } from '@proj-airi/stage-shared'
import { Mutex } from 'async-mutex'

import { removeInferenceStatus, updateInferenceStatus } from '../../../composables/use-inference-status'
import { MODEL_NAMES, TIMEOUTS } from '../constants'
import { backgroundRemovalLoadEvent, backgroundRemovalProcessEvent, consumeLoadStream, signalWithTimeout } from '../contract'
import { getGPUCoordinator, getLoadQueue, MODEL_VRAM_ESTIMATES } from '../coordinator'
import { LOAD_PRIORITY } from '../load-queue'
import { InferenceAbortError, throwIfAborted } from '../protocol'

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

const LOAD_TIMEOUT = TIMEOUTS.BG_REMOVAL_LOAD
const PROCESS_TIMEOUT = TIMEOUTS.BG_REMOVAL_PROCESS

/**
 * Bind the Eventa invoke clients to a freshly created worker. Returns the
 * load (server-streaming) and process (unary) callables; the rpc type is
 * inferred so call sites stay aligned with the library's option shapes.
 */
function createBgRemovalRpc(worker: Worker) {
  const { context } = createContext(worker)
  return {
    load: defineStreamInvoke(context, backgroundRemovalLoadEvent),
    process: defineInvoke(context, backgroundRemovalProcessEvent),
  }
}

type BgRemovalRpc = ReturnType<typeof createBgRemovalRpc>

export function createBackgroundRemovalAdapter(): BackgroundRemovalAdapter {
  let worker: Worker | null = null
  let rpc: BgRemovalRpc | null = null
  let state: BackgroundRemovalAdapter['state'] = 'idle'
  let allocationToken: AllocationToken | null = null
  let errorListener: ((event: ErrorEvent) => void) | null = null

  const operationMutex = new Mutex()

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

  function ensureWorker(): Worker {
    if (!worker) {
      worker = new Worker(
        new URL('../../../workers/background-removal/worker.ts', import.meta.url),
        { type: 'module' },
      )
      rpc = createBgRemovalRpc(worker)
      // NOTICE: Eventa already rejects in-flight invokes on a fatal worker
      // error (it sets `worker.onerror`); this native 'error' listener coexists
      // with it and owns the adapter's failure policy, mirroring the pre-Eventa
      // error listener. Background removal has no device-loss/restart logic.
      errorListener = (_event: ErrorEvent) => {
        state = 'error'
        operationMutex.cancel()
        // Tear the crashed worker down so it is not reused: ensureWorker() only
        // builds a worker when `worker` is null, so without this a later load()
        // would reattach to the dead worker and never recover (terminate() being
        // the only escape). No restart is scheduled — recovery is a fresh load().
        destroyWorker()
      }
      worker.addEventListener('error', errorListener)
    }
    return worker
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
        ensureWorker()
        if (!rpc)
          throw new Error('Background removal worker not initialized')

        const stream = rpc.load(
          { device: 'webgpu' },
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
            updateInferenceStatus(MODEL_NAMES.BG_REMOVAL, { progress })
            onProgress?.(progress)
          }).catch((error) => {
            // Normalize caller-driven aborts to InferenceAbortError so callers
            // see name === 'AbortError'.
            if (options?.signal?.aborted)
              throw new InferenceAbortError(typeof options.signal.reason === 'string' ? options.signal.reason : undefined)
            throw error
          })
        }
        catch (error) {
          state = 'error'
          updateInferenceStatus(MODEL_NAMES.BG_REMOVAL, { state: 'error' })
          throw error
        }

        const coordinator = getGPUCoordinator()
        if (allocationToken)
          coordinator.release(allocationToken)
        allocationToken = coordinator.requestAllocation(
          MODEL_NAMES.BG_REMOVAL,
          MODEL_VRAM_ESTIMATES.modnet ?? 25 * 1024 * 1024,
        )

        state = 'ready'
        updateInferenceStatus(MODEL_NAMES.BG_REMOVAL, { state: 'ready', device: info.device as any })
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
      if (!worker || !rpc || (state !== 'ready' && state !== 'processing'))
        throw new Error('Model not loaded. Call load() first.')

      state = 'processing'

      const pixelsCopy = new Uint8ClampedArray(imageData.data)
      let result
      try {
        result = await rpc.process(
          { imageData: pixelsCopy, width: imageData.width, height: imageData.height },
          { signal: signalWithTimeout(options?.signal, PROCESS_TIMEOUT), transfer: [pixelsCopy.buffer] },
        ).catch((error) => {
          if (options?.signal?.aborted)
            throw new InferenceAbortError(typeof options.signal.reason === 'string' ? options.signal.reason : undefined)
          throw error
        })
      }
      catch (error) {
        // NOTICE: Only restore 'ready' for request-level failures (caller
        // cancellation, process timeout) — i.e. while the state we set is still
        // 'processing'. A fatal worker error fires the native 'error' listener
        // (state -> 'error', mutex cancelled) and Eventa then rejects this
        // in-flight invoke; terminate() likewise sets 'terminated'. Both run
        // concurrently with this catch, so unconditionally writing 'ready' here
        // would mask that policy and let later calls pass the ready-state guard
        // and dispatch work to a dead/torn-down worker. Leaving the listener's
        // state intact forces a reload/teardown instead.
        if (state === 'processing')
          state = 'ready'
        throw error
      }

      const output = new ImageData(
        new Uint8ClampedArray(imageData.data),
        imageData.width,
        imageData.height,
      )
      const maskData = result.maskData
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

/**
 * Background removal inference adapter.
 *
 * Talks to the Xenova/modnet worker over the Eventa inference contract
 * (`libs/inference/contract.ts`): load is a server-streaming invoke (progress
 * then a terminal `ready`); process is a unary invoke whose mask buffer is
 * transferred back zero-copy. Worker lifecycle and device-loss resilience are
 * delegated to {@link createGpuWorkerHost}; this module owns the background
 * removal contract, the mask → alpha compositing, and UI status emission.
 */

import type { ProgressPayload } from '../protocol'

import { defineInvoke, defineStreamInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/webworkers'
import { defaultPerfTracer } from '@proj-airi/stage-shared'

import { removeInferenceStatus, updateInferenceStatus } from '../../../composables/use-inference-status'
import { MODEL_NAMES, TIMEOUTS } from '../constants'
import { backgroundRemovalLoadEvent, backgroundRemovalProcessEvent, consumeLoadStream, signalWithTimeout } from '../contract'
import { MODEL_VRAM_ESTIMATES } from '../coordinator'
import { GPU_PRIORITY } from '../gpu-executor'
import { createGpuWorkerHost } from '../gpu-worker-host'
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

  /** Number of WebGPU device-loss events observed by this adapter */
  readonly deviceLossCount: number
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
  const host = createGpuWorkerHost<BgRemovalRpc>({
    modelId: MODEL_NAMES.BG_REMOVAL,
    createWorker: () => new Worker(
      new URL('../../../workers/background-removal/worker.ts', import.meta.url),
      { type: 'module' },
    ),
    createRpc: createBgRemovalRpc,
    onTerminate: () => removeInferenceStatus(MODEL_NAMES.BG_REMOVAL),
  })

  async function load(
    onProgress?: (p: ProgressPayload) => void,
    options?: { signal?: AbortSignal },
  ): Promise<void> {
    // NOTICE: Proactive WASM promotion after repeated device-loss events.
    // Background removal always requests 'webgpu' from the caller today.
    const requestedDevice = host.promoteDevice('webgpu')
    throwIfAborted(options?.signal)
    return host.runExclusive(async () => {
      throwIfAborted(options?.signal)
      host.setPhase('loading')
      updateInferenceStatus(MODEL_NAMES.BG_REMOVAL, { state: 'downloading', device: requestedDevice as any })

      return host.runOnGpu(MODEL_NAMES.BG_REMOVAL, GPU_PRIORITY.BG_REMOVAL_LOAD, options?.signal, async ({ crashSignal }) => {
        throwIfAborted(options?.signal)
        const rpc = host.ensure()

        const stream = rpc.load(
          { device: requestedDevice },
          { signal: AbortSignal.any([signalWithTimeout(options?.signal, LOAD_TIMEOUT), crashSignal]) },
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
          host.setPhase('error')
          updateInferenceStatus(MODEL_NAMES.BG_REMOVAL, { state: 'error' })
          throw error
        }

        host.allocate(MODEL_NAMES.BG_REMOVAL, MODEL_VRAM_ESTIMATES[MODEL_NAMES.BG_REMOVAL] ?? 25 * 1024 * 1024)

        host.setPhase('ready')
        updateInferenceStatus(MODEL_NAMES.BG_REMOVAL, { state: 'ready', device: info.device as any })
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

  async function processImage(
    imageData: ImageData,
    options?: { signal?: AbortSignal },
  ): Promise<ImageData> {
    throwIfAborted(options?.signal)
    // Model-not-loaded is a request-level rejection, not a worker death: sentinel
    // it so the outer catch rejects without tearing the worker down (mirrors
    // kokoro/whisper's not-ready guard).
    const notReadyError = new Error('Model not loaded. Call load() first.')

    return defaultPerfTracer.withMeasure('inference', 'bg-removal-process', () => host.runExclusive(async () => {
      throwIfAborted(options?.signal)
      if (!host.rpc || host.phase !== 'ready')
        throw notReadyError

      host.touch()
      host.setPhase('busy')

      const pixelsCopy = new Uint8ClampedArray(imageData.data)
      let result
      try {
        // `crashSignal` aborts the in-flight process on worker death so the GPU
        // slot frees immediately; see {@link GpuWorkerHost.runOnGpu}.
        result = await host.runOnGpu(MODEL_NAMES.BG_REMOVAL, GPU_PRIORITY.BG_REMOVAL_PROCESS, options?.signal, ({ crashSignal }) => host.rpc!.process(
          { imageData: pixelsCopy, width: imageData.width, height: imageData.height },
          { signal: AbortSignal.any([signalWithTimeout(options?.signal, PROCESS_TIMEOUT), crashSignal]), transfer: [pixelsCopy.buffer] },
        ))
      }
      catch (error) {
        // A caller cancellation is request-level, not a worker death: the worker
        // and loaded model are intact, so restore 'ready' and surface
        // AbortError. Genuine failures (timeout, worker crash) fall through to
        // the outer catch -> host.handleWorkerError.
        if (options?.signal?.aborted) {
          host.setPhase('ready')
          throw new InferenceAbortError(typeof options.signal.reason === 'string' ? options.signal.reason : undefined)
        }
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

      host.setPhase('ready')
      host.recordSuccess()
      return output
    }), { width: imageData.width, height: imageData.height }).catch((error) => {
      // notReadyError and caller cancellation (AbortError) are request-level and
      // must not tear the worker down or trigger restart logic — mirrors load's
      // guard above.
      if (error === notReadyError || (error as Error)?.name === 'AbortError')
        throw error
      host.handleWorkerError(error instanceof Error ? error : new Error(String(error)))
      throw error
    })
  }

  return {
    load,
    processImage,
    terminate: host.terminate,
    get state() { return host.phase === 'busy' ? 'processing' : host.phase },
    get deviceLossCount() { return host.deviceLossCount },
  }
}

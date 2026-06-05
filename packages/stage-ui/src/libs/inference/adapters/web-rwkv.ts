/**
 * web-rwkv (WebGPU RWKV) inference adapter.
 *
 * Talks to the web-rwkv worker over the Eventa inference contract
 * (`libs/inference/contract.ts`): load and generate are both server-streaming
 * invokes (load emits progress then a terminal `ready`; generate emits decoded
 * text chunks). Worker lifecycle, the shared GPU slot, and device-loss
 * resilience are delegated to {@link createGpuWorkerHost} — so RWKV generation
 * is scheduled against TTS/ASR on the one GPU (it outranks STT, yields to TTS;
 * see {@link GPU_PRIORITY}).
 *
 * web-rwkv is WebGPU-only (no WASM/CPU backend), so — unlike kokoro/whisper —
 * this adapter never promotes to `wasm` on device loss; the host simply restarts
 * the worker and retries on WebGPU.
 */

import type { WebRwkvGenerateRequest } from '../contract'
import type { ProgressPayload } from '../protocol'

import { defineStreamInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/webworkers'
import { defaultPerfTracer } from '@proj-airi/stage-shared'
import { Mutex } from 'async-mutex'

import { removeInferenceStatus, updateInferenceStatus } from '../../../composables/use-inference-status'
import { MODEL_NAMES, TIMEOUTS } from '../constants'
import { consumeLoadStream, createIdleTimeout, webRwkvGenerateEvent, webRwkvLoadEvent } from '../contract'
import { MODEL_VRAM_ESTIMATES } from '../coordinator'
import { GPU_PRIORITY } from '../gpu-executor'
import { createGpuWorkerHost } from '../gpu-worker-host'
import { InferenceAbortError, InferenceTimeoutError, throwIfAborted } from '../protocol'

/** Options for {@link WebRwkvAdapter.generate}. */
export interface WebRwkvGenerateOptions {
  /** Called with each decoded text chunk as it streams. */
  onToken?: (text: string) => void
  /** Cancel generation; the promise rejects with `InferenceAbortError`. */
  signal?: AbortSignal
}

export interface WebRwkvAdapter {
  /**
   * Load a web-rwkv model from a safetensors URL (+ optional vocab URL). The
   * worker casts bf16/f32 weights to f16. Pass `options.signal` to cancel.
   */
  loadModel: (
    model: string,
    vocab: string | undefined,
    options?: { onProgress?: (p: ProgressPayload) => void, signal?: AbortSignal },
  ) => Promise<void>

  /**
   * Generate a completion for an already-templated RWKV prompt, streaming text
   * chunks to `options.onToken` and resolving with the full concatenated text.
   */
  generate: (request: WebRwkvGenerateRequest, options?: WebRwkvGenerateOptions) => Promise<string>

  /** Terminate the worker. */
  terminate: () => void

  /** Current state. */
  readonly state: 'idle' | 'loading' | 'ready' | 'running' | 'error' | 'terminated'

  /** Snapshot of the last successful load (model + vocab URLs), or null. */
  readonly manifest: { model: string, vocab: string } | null

  /** Number of WebGPU device-loss events observed by this adapter. */
  readonly deviceLossCount: number
}

const LOAD_FIRST_PART_TIMEOUT = TIMEOUTS.WEB_RWKV_LOAD_FIRST_PART
const LOAD_IDLE_TIMEOUT = TIMEOUTS.WEB_RWKV_LOAD_IDLE
const GENERATE_FIRST_CHUNK_TIMEOUT = TIMEOUTS.WEB_RWKV_GENERATE_FIRST_CHUNK
const GENERATE_IDLE_TIMEOUT = TIMEOUTS.WEB_RWKV_GENERATE_IDLE

/**
 * Bind the Eventa invoke clients to a freshly created worker. Both load and
 * generate are server-streaming invokes.
 */
function createWebRwkvRpc(worker: Worker) {
  const { context } = createContext(worker)
  return {
    load: defineStreamInvoke(context, webRwkvLoadEvent),
    generate: defineStreamInvoke(context, webRwkvGenerateEvent),
  }
}

type WebRwkvRpc = ReturnType<typeof createWebRwkvRpc>

interface WebRwkvManifest {
  model: string
  vocab: string
}

export function createWebRwkvAdapter(): WebRwkvAdapter {
  let lastManifest: WebRwkvManifest | null = null
  // The last successful load request, replayed by generate()'s load-on-demand
  // guard after a crash/restart left the worker bare.
  let lastLoadConfig: { model: string, vocab: string | undefined } | null = null

  const host = createGpuWorkerHost<WebRwkvRpc>({
    modelId: MODEL_NAMES.WEB_RWKV,
    createWorker: () => new Worker(
      new URL('../../../workers/web-rwkv/worker.ts', import.meta.url),
      { type: 'module' },
    ),
    createRpc: createWebRwkvRpc,
    onTerminate: () => {
      removeInferenceStatus(MODEL_NAMES.WEB_RWKV)
    },
  })

  async function loadModel(
    model: string,
    vocab: string | undefined,
    options?: { onProgress?: (p: ProgressPayload) => void, signal?: AbortSignal },
  ): Promise<void> {
    throwIfAborted(options?.signal)

    return defaultPerfTracer.withMeasure('inference', 'web-rwkv-load-model', () => host.runExclusive(async () => {
      throwIfAborted(options?.signal)
      host.setPhase('loading')
      console.info('[web-rwkv] loading model', { model, vocab })
      updateInferenceStatus(MODEL_NAMES.WEB_RWKV, { state: 'downloading', device: 'webgpu' })

      const rpc = host.ensure()

      return host.runOnGpu(MODEL_NAMES.WEB_RWKV, GPU_PRIORITY.LLM_LOAD, options?.signal, async ({ crashSignal }) => {
        throwIfAborted(options?.signal)

        // Two-tier inactivity timeout: generous first-part budget covers the
        // HTTP probe + safetensors header fetch; inter-part budget resets on
        // each progress event so a slow-but-active download never trips the
        // timeout — only a genuine CDN stall does.
        const idle = createIdleTimeout(LOAD_FIRST_PART_TIMEOUT, LOAD_IDLE_TIMEOUT)
        const signals = [idle.signal, crashSignal]
        if (options?.signal)
          signals.push(options.signal)

        try {
          const stream = rpc.load(
            { device: 'webgpu', model, vocab },
            { signal: AbortSignal.any(signals) },
          )

          await consumeLoadStream(stream, (progress) => {
            idle.reset()
            updateInferenceStatus(MODEL_NAMES.WEB_RWKV, { progress })
            options?.onProgress?.(progress)
          }).catch((error) => {
            if (options?.signal?.aborted)
              throw new InferenceAbortError(typeof options.signal.reason === 'string' ? options.signal.reason : undefined)
            if (idle.signal.aborted)
              throw idle.signal.reason instanceof Error ? idle.signal.reason : new InferenceTimeoutError()
            throw error
          })
        }
        finally {
          idle.clear()
        }

        host.allocate(MODEL_NAMES.WEB_RWKV, MODEL_VRAM_ESTIMATES[MODEL_NAMES.WEB_RWKV] ?? 512 * 1024 * 1024)
        lastManifest = { model, vocab: vocab ?? '' }
        lastLoadConfig = { model, vocab }

        host.setPhase('ready')
        console.info('[web-rwkv] model loaded', { model, vocab })
        updateInferenceStatus(MODEL_NAMES.WEB_RWKV, { state: 'ready', device: 'webgpu' })
        host.recordSuccess()
      })
    })).catch((error) => {
      if ((error as Error)?.name === 'AbortError')
        throw error
      host.handleWorkerError(error instanceof Error ? error : new Error(String(error)))
      throw error
    })
  }

  async function generate(request: WebRwkvGenerateRequest, options?: WebRwkvGenerateOptions): Promise<string> {
    throwIfAborted(options?.signal)

    // Load-on-demand recovery: a crash/restart respawns a bare worker ('idle').
    // Replay the last load before generating. Done before runExclusive — loadModel
    // takes the same host mutex, so calling it inside would deadlock.
    if (host.phase === 'idle' && lastLoadConfig)
      await loadModel(lastLoadConfig.model, lastLoadConfig.vocab, { signal: options?.signal })

    const notReadyError = new Error('web-rwkv: model not loaded. Call loadModel() first.')

    return defaultPerfTracer.withMeasure('inference', 'web-rwkv-generate', () => host.runExclusive(async () => {
      throwIfAborted(options?.signal)
      if (!host.rpc || host.phase !== 'ready')
        throw notReadyError

      host.touch()
      host.setPhase('busy')
      console.info('[web-rwkv] inference starting')

      let text = ''
      try {
        await host.runOnGpu(MODEL_NAMES.WEB_RWKV, GPU_PRIORITY.LLM_GENERATE, options?.signal, async ({ slot, crashSignal }) => {
          // Start the TTFT timer only after the GPU slot is acquired — avoids
          // burning the first-token budget while waiting for GPU contention
          // (e.g. a concurrent TTS generate) to clear.
          const idle = createIdleTimeout(GENERATE_FIRST_CHUNK_TIMEOUT, GENERATE_IDLE_TIMEOUT)
          const signals = [idle.signal, crashSignal]
          if (options?.signal)
            signals.push(options.signal)
          try {
            const stream = host.rpc!.generate(
              request,
              { signal: AbortSignal.any(signals) },
            )
            for await (const chunk of stream) {
              idle.reset()
              text += chunk.text
              console.info('[web-rwkv] inference token generated', chunk.text)
              options?.onToken?.(chunk.text)
              // Cooperative preemption point between tokens — lets a higher-priority
              // unit (e.g. a TTS generate) take the GPU mid-stream.
              await slot.yield()
            }
          }
          catch (error) {
            // Inactivity timeout: worker wedged → TimeoutError routes through restart.
            if (idle.signal.aborted)
              throw idle.signal.reason instanceof Error ? idle.signal.reason : new InferenceTimeoutError()
            throw error
          }
          finally {
            idle.clear()
          }
        })
      }
      catch (error) {
        // Caller cancellation is request-level: restore 'ready' and surface
        // AbortError (the outer catch exempts it from restart logic).
        if (options?.signal?.aborted) {
          host.setPhase('ready')
          throw new InferenceAbortError(typeof options.signal.reason === 'string' ? options.signal.reason : undefined)
        }
        throw error
      }

      host.setPhase('ready')
      console.info('[web-rwkv] inference done', { chars: text.length })
      host.recordSuccess()
      return text
    }), { promptChars: request.prompt.length }).catch((error) => {
      // notReadyError and caller cancellation are request-level — don't tear the
      // worker down or trigger restart logic.
      if (error === notReadyError || (error as Error)?.name === 'AbortError')
        throw error
      host.handleWorkerError(error instanceof Error ? error : new Error(String(error)))
      throw error
    })
  }

  return {
    loadModel,
    generate,
    terminate: host.terminate,
    get state() { return host.phase === 'busy' ? 'running' : host.phase },
    get manifest() { return lastManifest },
    get deviceLossCount() { return host.deviceLossCount },
  }
}

let globalAdapter: WebRwkvAdapter | null = null
const singletonMutex = new Mutex()

/**
 * Get the global web-rwkv adapter instance. Creates the worker on first use and
 * re-creates the adapter if it has entered a terminal state, mirroring
 * {@link getKokoroAdapter} / {@link getWhisperAdapter}.
 */
export async function getWebRwkvAdapter(): Promise<WebRwkvAdapter> {
  return singletonMutex.runExclusive(async () => {
    if (
      !globalAdapter
      || globalAdapter.state === 'terminated'
      || globalAdapter.state === 'error'
    ) {
      globalAdapter?.terminate()
      globalAdapter = createWebRwkvAdapter()
    }
    return globalAdapter
  })
}

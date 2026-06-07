/**
 * Kokoro TTS inference adapter.
 *
 * Talks to the Kokoro worker over the Eventa inference contract
 * (`libs/inference/contract.ts`): load and generate are both server-streaming
 * invokes (load emits progress then a terminal `ready`; generate emits
 * synthesized audio segments the adapter accumulates into a WAV buffer). Worker
 * lifecycle and device-loss resilience are delegated to {@link createGpuWorkerHost};
 * this module owns the Kokoro contract, the generate stream → WAV encoding, and
 * voice metadata.
 */

import type { VoiceKey, Voices } from '../../../workers/kokoro/types'
import type { ProgressPayload } from '../protocol'

import { defineStreamInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/webworkers'
import { defaultPerfTracer } from '@proj-airi/stage-shared'
import { Mutex } from 'async-mutex'

import { removeInferenceStatus, updateInferenceStatus } from '../../../composables/use-inference-status'
import { MODEL_NAMES, TIMEOUTS } from '../constants'
import { consumeLoadStream, createIdleTimeout, kokoroGenerateEvent, kokoroLoadEvent, signalWithTimeout } from '../contract'
import { MODEL_VRAM_ESTIMATES } from '../coordinator'
import { GPU_PRIORITY } from '../gpu-executor'
import { createGpuWorkerHost } from '../gpu-worker-host'
import { InferenceAbortError, InferenceTimeoutError, throwIfAborted } from '../protocol'

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

const LOAD_MODEL_TIMEOUT = TIMEOUTS.KOKORO_LOAD
const GENERATE_FIRST_CHUNK_TIMEOUT = TIMEOUTS.KOKORO_GENERATE_FIRST_CHUNK
const GENERATE_IDLE_TIMEOUT = TIMEOUTS.KOKORO_GENERATE_IDLE

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

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataLength, true)
  writeString(view, 8, 'WAVE')

  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true)
  view.setUint16(32, numChannels * bytesPerSample, true)
  view.setUint16(34, bitsPerSample, true)

  writeString(view, 36, 'data')
  view.setUint32(40, dataLength, true)

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

function concatFloat32(parts: Float32Array[]): Float32Array {
  if (parts.length === 1)
    return parts[0]
  let total = 0
  for (const part of parts)
    total += part.length
  const out = new Float32Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

interface KokoroManifest {
  quantization: string
  device: string
}

/**
 * Bind the Eventa invoke clients to a freshly created worker. Returns the
 * load and generate (both server-streaming) callables; the rpc type is
 * inferred so call sites stay aligned with the library's option shapes.
 */
function createKokoroRpc(worker: Worker) {
  const { context } = createContext(worker)
  return {
    load: defineStreamInvoke(context, kokoroLoadEvent),
    generate: defineStreamInvoke(context, kokoroGenerateEvent),
  }
}

type KokoroRpc = ReturnType<typeof createKokoroRpc>

export function createKokoroAdapter(): KokoroAdapter {
  let voices: Voices | null = null
  let currentModelStatusId: string | null = null
  // Records how the adapter resolved device selection after fallback / WASM
  // promotion. Adapter-owned; the host has no notion of Kokoro's manifest shape.
  let lastManifest: KokoroManifest | null = null
  // The last successful load request, replayed by generate()'s load-on-demand
  // guard after a crash/wedge restart left the worker bare. Holds the originally
  // requested args (not the post-fallback device) so the reload re-runs WASM
  // promotion the same way.
  let lastLoadConfig: { quantization: string, device: string } | null = null

  const host = createGpuWorkerHost<KokoroRpc>({
    // Telemetry id follows the active quantization once loaded, like the status id.
    modelId: () => currentModelStatusId ?? MODEL_NAMES.KOKORO,
    createWorker: () => new Worker(
      new URL('../../../workers/kokoro/worker.ts', import.meta.url),
      { type: 'module' },
    ),
    createRpc: createKokoroRpc,
    onTerminate: () => {
      if (currentModelStatusId)
        removeInferenceStatus(currentModelStatusId)
      voices = null
    },
  })

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
    const effectiveDevice = host.promoteDevice(device)
    throwIfAborted(options?.signal)

    return defaultPerfTracer.withMeasure('inference', 'kokoro-load-model', () => host.runExclusive(async () => {
      throwIfAborted(options?.signal)
      host.setPhase('loading')
      const modelStatusId = `kokoro-${quantization}`

      if (currentModelStatusId && currentModelStatusId !== modelStatusId)
        removeInferenceStatus(currentModelStatusId)
      currentModelStatusId = modelStatusId

      updateInferenceStatus(modelStatusId, { state: 'downloading', device: effectiveDevice as any })

      // Spawn the worker before entering the GPU slot (eager, matching the
      // pre-host adapter): device-loss telemetry must work for a load that is
      // merely queued in the executor, before its work callback ever runs.
      const rpc = host.ensure()

      return host.runOnGpu(modelStatusId, GPU_PRIORITY.TTS_LOAD, options?.signal, async ({ crashSignal }) => {
        throwIfAborted(options?.signal)

        const stream = rpc.load(
          { device: effectiveDevice as any, dtype: quantization },
          { signal: AbortSignal.any([signalWithTimeout(options?.signal, LOAD_MODEL_TIMEOUT), crashSignal]) },
        )

        const info = await consumeLoadStream(stream, (progress) => {
          updateInferenceStatus(modelStatusId, { progress })
          options?.onProgress?.(progress)
        }).catch((error) => {
          // Normalize caller-driven aborts to InferenceAbortError so the outer
          // catch (and callers) see name === 'AbortError'.
          if (options?.signal?.aborted)
            throw new InferenceAbortError(typeof options.signal.reason === 'string' ? options.signal.reason : undefined)
          throw error
        })

        voices = (info.metadata?.voices as Voices) ?? null

        const estimateKey = `kokoro-${quantization}`
        const estimated = MODEL_VRAM_ESTIMATES[estimateKey] ?? 165 * 1024 * 1024
        host.allocate(`kokoro-${quantization}`, estimated)

        // Record manifest so consumers can inspect how the adapter resolved
        // device selection after fallback / WASM promotion.
        lastManifest = { quantization, device: info.device }
        // Remember the request so the host's reload hook can replay it after a
        // restart. `device` is the originally requested device, not info.device.
        lastLoadConfig = { quantization, device }

        host.setPhase('ready')
        updateInferenceStatus(modelStatusId, { state: 'ready', device: info.device as any })
        host.recordSuccess()
        if (!voices)
          throw new Error('Kokoro worker did not return voice metadata')
        return voices
      })
    }), { quantization, device: effectiveDevice }).catch((error) => {
      // Don't route AbortError through handleWorkerError — cancellation is
      // not a worker failure and shouldn't trigger restart logic.
      if ((error as Error)?.name === 'AbortError')
        throw error
      host.handleWorkerError(error instanceof Error ? error : new Error(String(error)))
      throw error
    })
  }

  async function generate(
    text: string,
    voice: VoiceKey,
    options?: { signal?: AbortSignal },
  ): Promise<ArrayBuffer> {
    throwIfAborted(options?.signal)

    // Load-on-demand recovery: a wedge/crash restart respawns a bare worker
    // ('idle'). Rather than eagerly reloading the model (kokoro stays warm via
    // the startup preload, not here), re-acquire it on the next generate by
    // replaying the last load. Done before runExclusive — loadModel takes the
    // same host mutex, so calling it inside this runExclusive would deadlock.
    if (host.phase === 'idle' && lastLoadConfig)
      await loadModel(lastLoadConfig.quantization, lastLoadConfig.device, { signal: options?.signal })

    const notReadyError = new Error('Model not loaded. Call loadModel() first.')
    // A completed stream that produced no audio is a content-level failure, not
    // a worker death (see the guard below). Sentinel so the outer catch routes
    // it like notReadyError — reject without tearing the worker down.
    const emptyAudioError = new Error('inference: kokoro generate stream ended without audio')

    return defaultPerfTracer.withMeasure('inference', 'kokoro-generate', () => host.runExclusive(async () => {
      throwIfAborted(options?.signal)
      if (!host.rpc || host.phase !== 'ready')
        throw notReadyError

      host.touch()
      host.setPhase('busy')

      const chunks: Float32Array[] = []
      let samplingRate = 0
      // Two-tier inactivity timeout: a generous first-segment budget (warmup +
      // first sentence, slow on fp32) then a tighter inter-segment gap once the
      // worker has proven alive. A wedged worker trips it and is restarted via
      // the outer catch; a slow-but-progressing generation resets it per segment.
      const idle = createIdleTimeout(GENERATE_FIRST_CHUNK_TIMEOUT, GENERATE_IDLE_TIMEOUT)
      try {
        // `crashSignal` ends the stream on worker death so the slot frees
        // immediately; see {@link GpuWorkerHost.runOnGpu}.
        await host.runOnGpu(MODEL_NAMES.KOKORO, GPU_PRIORITY.TTS_GENERATE, options?.signal, async ({ slot, crashSignal }) => {
          const signals = [idle.signal, crashSignal]
          if (options?.signal)
            signals.push(options.signal)
          const stream = host.rpc!.generate(
            { text, voice },
            { signal: AbortSignal.any(signals) },
          )
          for await (const chunk of stream) {
            idle.reset()
            chunks.push(chunk.samples)
            samplingRate = chunk.samplingRate
            // Cooperative preemption point between synthesized segments.
            await slot.yield()
          }
        })
      }
      catch (error) {
        // A caller cancellation is request-level, not a worker death: restore
        // 'ready' (the worker and loaded model are intact) and surface
        // AbortError, which the outer catch exempts from restart logic. Checked
        // first so cancelling a wedged worker never restarts it.
        if (options?.signal?.aborted) {
          host.setPhase('ready')
          throw new InferenceAbortError(typeof options.signal.reason === 'string' ? options.signal.reason : undefined)
        }
        // Inactivity timeout: the worker is wedged. Surface a TimeoutError so the
        // outer catch routes it through host.handleWorkerError (restart). Genuine
        // worker crashes also fall through to the outer catch.
        if (idle.signal.aborted)
          throw idle.signal.reason instanceof Error ? idle.signal.reason : new InferenceTimeoutError()
        throw error
      }
      finally {
        idle.clear()
      }

      // NOTICE: A completed stream with no audio segments is a dropped result,
      // not a valid empty waveform — `samplingRate` would still be 0 and
      // encodeWav would emit a malformed WAV header. The pre-streaming unary
      // path always returned a sampled buffer; surface the failure instead.
      // The worker and loaded model are intact, so restore 'ready' and reject at
      // the request level (mirrors whisper's terminal-result guard) rather than
      // routing through handleWorkerError and tearing the worker down.
      if (chunks.length === 0) {
        host.setPhase('ready')
        throw emptyAudioError
      }

      host.setPhase('ready')
      host.recordSuccess()
      return encodeWav(concatFloat32(chunks), samplingRate)
    }), { text: text.slice(0, 50), voice }).catch((error) => {
      // notReadyError, an empty-audio result, and caller cancellation
      // (AbortError) are request-level and must not tear the worker down or
      // trigger restart logic — mirrors loadModel's guard above.
      if (error === notReadyError || error === emptyAudioError || (error as Error)?.name === 'AbortError')
        throw error

      host.handleWorkerError(error instanceof Error ? error : new Error(String(error)))
      throw error
    })
  }

  function getVoices(): Voices {
    if (!voices)
      throw new Error('Model not loaded. Call loadModel() first.')
    return voices
  }

  return {
    loadModel,
    generate,
    getVoices,
    terminate: host.terminate,
    get state() { return host.phase === 'busy' ? 'running' : host.phase },
    get manifest() { return lastManifest },
    get deviceLossCount() { return host.deviceLossCount },
  }
}

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
      // Dispose the dead instance before replacing it: terminate() cancels any
      // pending restart timer so the discarded adapter can't spawn an orphan
      // worker after we drop our reference to it.
      globalAdapter?.terminate()
      globalAdapter = createKokoroAdapter()
    }
    return globalAdapter
  })
}

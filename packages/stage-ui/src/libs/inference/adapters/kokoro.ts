/**
 * Kokoro TTS inference adapter.
 *
 * Bridges the generic `InferenceWorkerManager` protocol with the
 * Kokoro-specific worker message format. The underlying worker
 * (`workers/kokoro/worker.ts`) keeps its existing message types —
 * this adapter translates between the two protocols.
 */

import type { VoiceKey, Voices } from '../../../workers/kokoro/types'
import type { ProgressPayload } from '../protocol'

import { defaultPerfTracer } from '@proj-airi/stage-shared'

import { AsyncMutex } from '../async-mutex'
import { classifyError } from '../protocol'

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

const LOAD_MODEL_TIMEOUT = 120_000
const GENERATE_TIMEOUT = 120_000
const MAX_RESTARTS = 3
const RESTART_DELAY_MS = 1_000

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

// Reuse the waitForEvent pattern from the original KokoroWorkerManager
interface WaitForEventOptions<T extends Event> {
  predicate?: (event: T) => boolean
  callback?: (event: T) => void
  timeout?: number
  timeoutError?: Error
}

function waitForEvent<T extends Event>(
  element: EventTarget,
  eventName: string,
  options: WaitForEventOptions<T> = {},
): Promise<T> {
  const {
    predicate = () => true,
    callback = () => {},
    timeout,
    timeoutError = new Error(`Timeout waiting for event: ${eventName}`),
  } = options

  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const listener = (event: Event) => {
      const typedEvent = event as T
      if (predicate(typedEvent)) {
        if (timeoutId !== undefined)
          clearTimeout(timeoutId)
        element.removeEventListener(eventName, listener)
        resolve(typedEvent)
      }
      else {
        callback(typedEvent)
      }
    }

    element.addEventListener(eventName, listener)

    if (timeout !== undefined) {
      timeoutId = setTimeout(() => {
        element.removeEventListener(eventName, listener)
        reject(timeoutError)
      }, timeout)
    }
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

  const operationMutex = new AsyncMutex()
  const lifecycleMutex = new AsyncMutex()

  function initializeWorker(): void {
    worker = new Worker(
      new URL('../../../workers/kokoro/worker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.addEventListener('error', handleWorkerError)
  }

  function handleWorkerError(event: ErrorEvent | Error): void {
    const message = event instanceof Error
      ? event.message
      : (event as ErrorEvent).message ?? 'Unknown worker error'

    state = 'error'
    operationMutex.reset(new Error(message))
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
    await lifecycleMutex.run(async () => {
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

    return defaultPerfTracer.withMeasure('inference', 'kokoro-load-model', () => operationMutex.run(async () => {
      state = 'loading'

      // NOTICE: We listen for the existing Kokoro worker protocol ('loaded'
      // type) rather than the unified protocol. The worker.ts file is
      // unchanged — this adapter does the translation.
      const voicePromise = waitForEvent<MessageEvent>(worker!, 'message', {
        predicate: event => event.data.type === 'loaded',
        callback: (event) => {
          if (event.data.type === 'progress' && options?.onProgress) {
            const raw = event.data.progress
            options.onProgress({
              phase: 'download',
              // NOTICE: raw.progress from kokoro-js/@huggingface/transformers is already 0-100
              percent: raw?.progress != null ? Math.round(raw.progress) : -1,
              message: raw?.status ?? undefined,
              file: raw?.file ?? undefined,
              loaded: raw?.loaded ?? undefined,
              total: raw?.total ?? undefined,
            })
          }
        },
        timeout: LOAD_MODEL_TIMEOUT,
      })

      worker!.postMessage({
        type: 'load',
        data: { quantization, device },
      })

      const event = await voicePromise
      voices = event.data.voices
      state = 'ready'
      onSuccess()
      return voices!
    }), { quantization, device }).catch((error) => {
      handleWorkerError(error instanceof Error ? error : new Error(String(error)))
      throw error
    })
  }

  async function generate(text: string, voice: VoiceKey): Promise<ArrayBuffer> {
    return defaultPerfTracer.withMeasure('inference', 'kokoro-generate', () => operationMutex.run(async () => {
      if (!worker)
        throw new Error('Worker not initialized. Call loadModel() first.')

      state = 'running'

      const resultPromise = waitForEvent<MessageEvent>(worker, 'message', {
        predicate: event => event.data.type === 'result',
        timeout: GENERATE_TIMEOUT,
      })

      worker.postMessage({
        type: 'generate',
        data: { text, voice },
      })

      const event = await resultPromise
      const response = event.data

      if (response.status === 'success') {
        state = 'ready'
        onSuccess()
        return response.buffer as ArrayBuffer
      }

      const errorCode = classifyError(new Error(response.message ?? 'Generation failed'))
      throw new Error(`[${errorCode}] ${response.message ?? 'Generation failed'}`)
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
    operationMutex.reset(new Error('Adapter terminated'))
    destroyWorker()
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
const singletonMutex = new AsyncMutex()

/**
 * Get the global Kokoro adapter instance.
 * Creates and starts the worker on first call.
 */
export async function getKokoroAdapter(): Promise<KokoroAdapter> {
  return singletonMutex.run(async () => {
    if (!globalAdapter)
      globalAdapter = createKokoroAdapter()
    return globalAdapter
  })
}

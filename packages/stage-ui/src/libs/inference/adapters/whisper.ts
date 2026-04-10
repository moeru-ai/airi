/**
 * Whisper ASR inference adapter.
 *
 * Uses the unified inference protocol from protocol.ts.
 * Preserves the onMessage API for streaming UI updates by forwarding
 * unified protocol messages to subscribers.
 */

import type { AllocationToken } from '../gpu-resource-coordinator'
import type { ProgressPayload } from '../protocol'

import { AsyncMutex } from '../async-mutex'
import { getGPUCoordinator, getLoadQueue, MODEL_VRAM_ESTIMATES } from '../coordinator'
import { LOAD_PRIORITY } from '../load-queue'
import { createRequestId } from '../protocol'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WhisperState
  = | 'idle'
    | 'loading'
    | 'ready'
    | 'transcribing'
    | 'error'
    | 'terminated'

export interface WhisperTranscribeInput {
  audio?: string
  audioFloat32?: Float32Array
  language: string
}

/**
 * Unified message events for Whisper, based on protocol.ts types.
 * These replace the old status-based MessageEvents.
 */
export type WhisperEvent
  = | { type: 'progress', payload: ProgressPayload & Record<string, unknown> }
    | { type: 'model-ready' }
    | { type: 'inference-result', output: { text: string[] } }
    | { type: 'error', payload: { code: string, message: string } }

export interface WhisperAdapter {
  /** Load the Whisper model */
  load: (onProgress?: (p: ProgressPayload) => void) => Promise<void>

  /** Transcribe audio, returning the text result */
  transcribe: (input: WhisperTranscribeInput) => Promise<string>

  /** Terminate the worker */
  terminate: () => void

  /** Current state */
  readonly state: WhisperState

  /**
   * Subscribe to unified protocol events for streaming UI updates.
   * Returns an unsubscribe function.
   */
  onMessage: (handler: (event: WhisperEvent) => void) => () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOAD_TIMEOUT = 180_000 // Whisper model is large, allow more time
const TRANSCRIBE_TIMEOUT = 120_000

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createWhisperAdapter(workerUrl: string | URL): WhisperAdapter {
  let worker: Worker | null = null
  let state: WhisperState = 'idle'
  let allocationToken: AllocationToken | null = null
  const messageHandlers = new Set<(event: WhisperEvent) => void>()

  const operationMutex = new AsyncMutex()

  function ensureWorker(): Worker {
    if (!worker) {
      worker = new Worker(workerUrl, { type: 'module' })
      worker.addEventListener('message', (event: MessageEvent) => {
        const data = event.data
        // Forward unified protocol messages to subscribers
        if (data.type === 'progress') {
          const evt: WhisperEvent = { type: 'progress', payload: data.payload }
          for (const handler of messageHandlers) handler(evt)
        }
        else if (data.type === 'model-ready') {
          const evt: WhisperEvent = { type: 'model-ready' }
          for (const handler of messageHandlers) handler(evt)
        }
        else if (data.type === 'inference-result') {
          const evt: WhisperEvent = { type: 'inference-result', output: data.output }
          for (const handler of messageHandlers) handler(evt)
        }
        else if (data.type === 'error') {
          const evt: WhisperEvent = { type: 'error', payload: data.payload }
          for (const handler of messageHandlers) handler(evt)
        }
      })
      worker.addEventListener('error', (event) => {
        state = 'error'
        operationMutex.reset(new Error(event.message ?? 'Worker error'))
      })
    }
    return worker
  }

  /**
   * Wait for a specific unified protocol message type, filtered by requestId.
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
        reject(new Error(`Whisper: timeout after ${timeout}ms waiting for '${targetType}'`))
      }, timeout)
    })
  }

  async function load(
    onProgress?: (p: ProgressPayload) => void,
  ): Promise<void> {
    return operationMutex.run(async () => {
      state = 'loading'

      return getLoadQueue().enqueue('whisper-large-v3-turbo', LOAD_PRIORITY.ASR, async () => {
        const w = ensureWorker()
        const requestId = createRequestId()

        const readyPromise = waitForMessage(w, requestId, 'model-ready', LOAD_TIMEOUT, (data) => {
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

        w.postMessage({ type: 'load-model', requestId, modelId: 'whisper-large-v3-turbo', device: 'webgpu' })

        try {
          await readyPromise

          // Track GPU memory allocation
          const coordinator = getGPUCoordinator()
          if (allocationToken)
            coordinator.release(allocationToken)
          allocationToken = coordinator.requestAllocation(
            'whisper-large-v3-turbo',
            MODEL_VRAM_ESTIMATES['whisper-large-v3-turbo'] ?? 800 * 1024 * 1024,
          )

          state = 'ready'
        }
        catch (error) {
          state = 'error'
          throw error
        }
      })
    })
  }

  async function transcribe(input: WhisperTranscribeInput): Promise<string> {
    return operationMutex.run(async () => {
      if (!worker || state !== 'ready')
        throw new Error('Model not loaded. Call load() first.')

      state = 'transcribing'
      const requestId = createRequestId()

      const resultPromise = waitForMessage<any>(worker, requestId, 'inference-result', TRANSCRIBE_TIMEOUT)

      worker.postMessage({
        type: 'run-inference',
        requestId,
        input: {
          audio: input.audio,
          audioFloat32: input.audioFloat32,
          language: input.language,
        },
      })

      try {
        const result = await resultPromise
        state = 'ready'
        return result.output?.text?.[0] ?? ''
      }
      catch (error) {
        state = 'error'
        throw error
      }
    })
  }

  function terminateAdapter(): void {
    operationMutex.reset(new Error('Adapter terminated'))
    if (worker) {
      worker.terminate()
      worker = null
    }
    if (allocationToken) {
      getGPUCoordinator().release(allocationToken)
      allocationToken = null
    }
    messageHandlers.clear()
    state = 'terminated'
  }

  function onMessage(handler: (event: WhisperEvent) => void): () => void {
    messageHandlers.add(handler)
    return () => messageHandlers.delete(handler)
  }

  return {
    load,
    transcribe,
    terminate: terminateAdapter,
    onMessage,
    get state() { return state },
  }
}

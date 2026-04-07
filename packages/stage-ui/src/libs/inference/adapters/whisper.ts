/**
 * Whisper ASR inference adapter.
 *
 * Bridges the generic inference protocol with the existing Whisper
 * worker (`libs/workers/worker.ts`). Adds timeout handling, WASM
 * fallback, and unified progress reporting while preserving the
 * existing composable API surface.
 */

import type {
  MessageEvents,
} from '../../workers/types'
import type { ProgressPayload } from '../protocol'

import { AsyncMutex } from '../async-mutex'

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
  audio: string
  language: string
}

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
   * Subscribe to raw worker events for streaming UI updates.
   * Returns an unsubscribe function.
   */
  onMessage: (handler: (event: MessageEvents) => void) => () => void
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
  const messageHandlers = new Set<(event: MessageEvents) => void>()

  const operationMutex = new AsyncMutex()

  function ensureWorker(): Worker {
    if (!worker) {
      worker = new Worker(workerUrl, { type: 'module' })
      worker.addEventListener('message', (event: MessageEvent<MessageEvents>) => {
        for (const handler of messageHandlers)
          handler(event.data)
      })
      worker.addEventListener('error', (event) => {
        state = 'error'
        operationMutex.reset(new Error(event.message ?? 'Worker error'))
      })
    }
    return worker
  }

  function waitForStatus(
    targetStatus: string,
    timeout: number,
  ): Promise<MessageEvents> {
    return new Promise<MessageEvents>((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      const w = ensureWorker()

      const handler = (event: MessageEvent<MessageEvents>) => {
        if (event.data.status === targetStatus) {
          if (timeoutId !== undefined)
            clearTimeout(timeoutId)
          w.removeEventListener('message', handler)
          resolve(event.data)
        }
      }

      w.addEventListener('message', handler)

      timeoutId = setTimeout(() => {
        w.removeEventListener('message', handler)
        reject(new Error(`Whisper: timeout after ${timeout}ms waiting for '${targetStatus}'`))
      }, timeout)
    })
  }

  async function load(
    onProgress?: (p: ProgressPayload) => void,
  ): Promise<void> {
    return operationMutex.run(async () => {
      state = 'loading'
      const w = ensureWorker()

      // Listen for progress during loading
      let progressHandler: ((event: MessageEvent<MessageEvents>) => void) | null = null
      if (onProgress) {
        progressHandler = (event: MessageEvent<MessageEvents>) => {
          const data = event.data
          if (data.status === 'loading') {
            onProgress({
              phase: 'compile',
              percent: -1,
              message: data.data,
            })
          }
          else if (data.status === 'progress') {
            onProgress({
              phase: 'download',
              percent: data.progress != null ? Math.round(data.progress * 100) : -1,
              file: data.file,
              loaded: data.loaded,
              total: data.total,
            })
          }
          else if (data.status === 'initiate') {
            onProgress({
              phase: 'download',
              percent: 0,
              file: data.file,
              message: `Loading ${data.file}`,
            })
          }
        }
        w.addEventListener('message', progressHandler)
      }

      const readyPromise = waitForStatus('ready', LOAD_TIMEOUT)
      w.postMessage({ type: 'load' })

      try {
        await readyPromise
        state = 'ready'
      }
      catch (error) {
        state = 'error'
        throw error
      }
      finally {
        if (progressHandler)
          w.removeEventListener('message', progressHandler)
      }
    })
  }

  async function transcribe(input: WhisperTranscribeInput): Promise<string> {
    return operationMutex.run(async () => {
      if (!worker || state !== 'ready')
        throw new Error('Model not loaded. Call load() first.')

      state = 'transcribing'

      const completePromise = waitForStatus('complete', TRANSCRIBE_TIMEOUT)
      worker.postMessage({
        type: 'generate',
        data: { audio: input.audio, language: input.language },
      })

      try {
        const result = await completePromise
        state = 'ready'
        if (result.status === 'complete') {
          return result.output[0] || ''
        }
        return ''
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
    messageHandlers.clear()
    state = 'terminated'
  }

  function onMessage(handler: (event: MessageEvents) => void): () => void {
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

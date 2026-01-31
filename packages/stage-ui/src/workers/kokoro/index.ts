/**
 * Kokoro TTS Worker Manager
 * Manages communication with the Kokoro TTS worker thread
 */

import { GENERATION_TIMEOUT_MS } from './constants'

export class KokoroWorkerManager {
  private worker: Worker | null = null
  private pendingRequests = new Map<number, {
    resolve: (value: ArrayBuffer) => void
    reject: (error: Error) => void
  }>()

  private loadPromise: Promise<void> | null = null
  private loadResolve: (() => void) | null = null
  private loadReject: ((error: Error) => void) | null = null
  private requestId = 0

  constructor() {
    this.initializeWorker()
  }

  private initializeWorker() {
    // Create worker from the worker.ts file
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), {
      type: 'module',
    })

    // Handle messages from the worker
    this.worker.addEventListener('message', (event) => {
      const { status, buffer, message, requestId: id } = event.data

      // Handle model loading status
      if (status === 'ready') {
        if (this.loadResolve) {
          this.loadResolve()
          this.loadResolve = null
          this.loadReject = null
          this.loadPromise = null
        }
      }

      // Handle generation completion
      if (status === 'complete' && id !== undefined) {
        const pending = this.pendingRequests.get(id)
        if (pending) {
          pending.resolve(buffer)
          this.pendingRequests.delete(id)
        }
      }
      else if (status === 'error') {
        const pending = this.pendingRequests.get(id)
        if (pending) {
          pending.reject(new Error(message))
          this.pendingRequests.delete(id)
        }
        else if (this.loadReject) {
          // Error during model loading
          this.loadReject(new Error(message))
          this.loadReject = null
          this.loadResolve = null
          this.loadPromise = null
        }
      }
    })

    this.worker.addEventListener('error', (event) => {
      const error = new Error(event.message || 'An unknown worker error occurred')

      // If a model load was pending, reject it
      if (this.loadReject) {
        this.loadReject(error)
        this.loadReject = null
        this.loadResolve = null
        this.loadPromise = null
      }

      // Reject any pending generation requests as well
      this.pendingRequests.forEach((pending) => {
        pending.reject(error)
      })

      this.pendingRequests.clear()

      // Terminate the worker as it's in an unrecoverable state.
      // A new worker will be initialized on the next 'loadModel' or 'generate' call.
      this.terminate()
    })
  }

  async loadModel(quantization: string, device: string) {
    if (!this.worker) {
      this.initializeWorker()
    }

    // Create a promise that resolves when the model is ready
    this.loadPromise = new Promise((resolve, reject) => {
      this.loadResolve = resolve
      this.loadReject = reject

      this.worker!.postMessage({
        type: 'load',
        data: { quantization, device },
      })
    })

    // Wait for the model to load
    await this.loadPromise
  }

  async generate(text: string, voice: string, quantization: string, device: string): Promise<ArrayBuffer> {
    if (!this.worker) {
      this.initializeWorker()
    }

    const requestId = this.requestId++

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId)
          reject(new Error('Kokoro TTS generation timeout'))
        }
      }, GENERATION_TIMEOUT_MS)

      this.pendingRequests.set(requestId, {
        resolve: (buffer: ArrayBuffer) => {
          clearTimeout(timeoutId)
          resolve(buffer)
        },
        reject: (error: Error) => {
          clearTimeout(timeoutId)
          reject(error)
        },
      })

      this.worker!.postMessage({
        type: 'generate',
        data: { text, voice, quantization, device, requestId },
      })
    })
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
      this.pendingRequests.clear()
    }
  }
}

// Global worker instance
let globalWorkerManager: KokoroWorkerManager | null = null

export async function getKokoroWorker(): Promise<KokoroWorkerManager> {
  if (!globalWorkerManager) {
    globalWorkerManager = new KokoroWorkerManager()
  }
  return globalWorkerManager
}

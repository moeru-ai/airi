/**
 * Global GPU resource coordinator singleton.
 *
 * Lazily initialized with detected VRAM from WebGPU capabilities.
 * All inference adapters should use this coordinator to track
 * their GPU memory allocations.
 */

import type { GPUResourceCoordinator } from './gpu-resource-coordinator'
import type { LoadQueue } from './load-queue'

import { getCachedWebGPUCapabilities } from '@proj-airi/stage-shared/webgpu'

import { MODEL_NAMES } from './constants'
import { createGPUResourceCoordinator } from './gpu-resource-coordinator'
import { createLoadQueue } from './load-queue'

let coordinator: GPUResourceCoordinator | null = null
let loadQueue: LoadQueue | null = null

/**
 * Get the global GPU resource coordinator.
 * Initializes lazily from cached WebGPU capabilities.
 */
export function getGPUCoordinator(): GPUResourceCoordinator {
  if (!coordinator) {
    const capabilities = getCachedWebGPUCapabilities()
    const estimatedVRAM = capabilities?.estimatedVRAM ?? 0
    coordinator = createGPUResourceCoordinator(estimatedVRAM)

    // Log memory pressure events
    coordinator.onMemoryPressure((level) => {
      const usage = coordinator!.getUsage()
      console.warn(
        `[GPU] Memory pressure: ${level} — `
        + `${Math.round(usage.allocated / 1024 / 1024)}MB / ${Math.round(usage.budget / 1024 / 1024)}MB `
        + `(models: ${usage.models.join(', ')})`,
      )
    })
  }

  return coordinator
}

/**
 * Get the global model load queue.
 * Ensures only one model loads at a time to prevent
 * bandwidth competition and GPU memory spikes.
 */
export function getLoadQueue(): LoadQueue {
  if (!loadQueue) {
    loadQueue = createLoadQueue()
  }
  return loadQueue
}

// Rough VRAM estimates per model (in bytes) for allocation tracking
export const MODEL_VRAM_ESTIMATES: Record<string, number> = {
  // Kokoro 82M — varies by quantization
  'kokoro-fp32-webgpu': 330 * 1024 * 1024, // ~330 MB
  'kokoro-fp16-webgpu': 165 * 1024 * 1024, // ~165 MB
  'kokoro-fp32': 330 * 1024 * 1024,
  'kokoro-fp16': 165 * 1024 * 1024,
  'kokoro-q8': 82 * 1024 * 1024,
  'kokoro-q4': 41 * 1024 * 1024,
  'kokoro-q4f16': 41 * 1024 * 1024,

  // Whisper large v3 turbo — encoder fp16 + decoder q4
  [MODEL_NAMES.WHISPER]: 800 * 1024 * 1024, // ~800 MB

  // Xenova/modnet — small model
  [MODEL_NAMES.BG_REMOVAL]: 25 * 1024 * 1024, // ~25 MB
}

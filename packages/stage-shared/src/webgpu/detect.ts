/**
 * Centralized WebGPU capability detection.
 *
 * Wraps `gpuu/webgpu` and caches the result so every consumer
 * gets the same answer without redundant adapter requests.
 */

import { check as gpuuCheck, isWebGPUSupported as gpuuIsSupported } from 'gpuu/webgpu'

export interface WebGPUCapabilities {
  /** Whether WebGPU is available in this environment */
  supported: boolean
  /** Whether fp16 shader operations are supported */
  fp16Supported: boolean
  /** Estimated VRAM in bytes (heuristic, 0 when unavailable) */
  estimatedVRAM: number
  /** Raw reason string from gpuu when unsupported */
  reason: string
}

let cachedResult: WebGPUCapabilities | null = null
let pendingDetection: Promise<WebGPUCapabilities> | null = null

/**
 * Detect WebGPU capabilities. The result is cached as a singleton
 * after the first successful call -- safe to call repeatedly.
 */
export async function detectWebGPU(): Promise<WebGPUCapabilities> {
  if (cachedResult)
    return cachedResult

  // Deduplicate concurrent calls
  if (pendingDetection)
    return pendingDetection

  pendingDetection = (async (): Promise<WebGPUCapabilities> => {
    try {
      const result = await gpuuCheck()

      let estimatedVRAM = 0
      if (result.supported && result.adapter) {
        // Use maxBufferSize as a rough proxy -- typically 256 MB on
        // integrated GPUs, 2-4 GB on discrete GPUs.
        // Multiply by 4 as a conservative total VRAM heuristic.
        const maxBuffer = result.adapter.limits?.maxBufferSize ?? 0
        estimatedVRAM = maxBuffer > 0 ? maxBuffer * 4 : 0
      }

      cachedResult = {
        supported: result.supported,
        fp16Supported: result.fp16Supported ?? false,
        estimatedVRAM,
        reason: result.reason ?? '',
      }
    }
    catch {
      cachedResult = {
        supported: false,
        fp16Supported: false,
        estimatedVRAM: 0,
        reason: 'Detection threw an exception',
      }
    }

    pendingDetection = null
    return cachedResult!
  })()

  return pendingDetection
}

/**
 * Synchronous check -- returns the cached result or `null` if
 * `detectWebGPU()` has not been awaited yet.
 */
export function getCachedWebGPUCapabilities(): WebGPUCapabilities | null {
  return cachedResult
}

/**
 * Simple boolean helper that matches the old `isWebGPUSupported()` API.
 * Prefer `detectWebGPU()` when you need more detail.
 */
export async function isWebGPUSupported(): Promise<boolean> {
  // Fast-path: if gpuu's lightweight check is enough
  return gpuuIsSupported()
}

/**
 * Reset the cached detection result. Intended for tests only.
 */
export function resetWebGPUCache(): void {
  cachedResult = null
  pendingDetection = null
}

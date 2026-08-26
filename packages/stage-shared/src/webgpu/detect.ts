/**
 * Centralized WebGPU capability detection.
 *
 * Wraps `gpuu/webgpu` and caches the result so every consumer
 * gets the same answer without redundant adapter requests.
 *
 * ## VRAM estimation
 *
 * The web platform does not expose GPU memory usage or total VRAM.
 * We approximate via three ordered sources:
 *
 *   1. User override (`setEstimatedVRAMOverride(bytes)`)
 *   2. `adapter.limits.maxBufferSize * 4` heuristic (fallback)
 *   3. Zero (unavailable)
 *
 * The provenance is reported via `WebGPUCapabilities.estimatedVRAMSource`
 * so consumers can surface it for diagnostics.
 */

import { check as gpuuCheck, isWebGPUSupported as gpuuIsSupported } from 'gpuu/webgpu'

/**
 * Source of the VRAM estimate, reported for observability.
 * - `override`: user-provided value via `setEstimatedVRAMOverride()`
 * - `max-buffer-heuristic`: derived from `adapter.limits.maxBufferSize * 4`
 * - `none`: no estimate available (WebGPU unsupported or adapter query failed)
 */
export type VRAMSource = 'max-buffer-heuristic' | 'none' | 'override'

/**
 * Subset of `GPUAdapterInfo` that we surface to consumers. Values come
 * directly from the browser's WebGPU implementation — treat them as
 * opaque strings; vendor/architecture naming is not standardized.
 */
export interface WebGPUAdapterInfo {
  /** Architecture name, e.g. "ada-lovelace", "apple-m1" */
  architecture: string
  /** Free-form description string from the driver */
  description: string
  /** Device description, e.g. "NVIDIA GeForce RTX 4090" */
  device: string
  /** Vendor name, e.g. "nvidia", "apple", "intel" */
  vendor: string
}

export interface WebGPUCapabilities {
  /** Adapter-reported vendor/architecture/device info, when available */
  adapterInfo: null | WebGPUAdapterInfo
  /** Estimated VRAM in bytes (0 when unavailable) */
  estimatedVRAM: number
  /** Provenance of the VRAM estimate */
  estimatedVRAMSource: VRAMSource
  /** Whether fp16 shader operations are supported */
  fp16Supported: boolean
  /** Raw reason string from gpuu when unsupported */
  reason: string
  /** Whether WebGPU is available in this environment */
  supported: boolean
}

// Minimal structural subset of the WebGPU types we interact with.
// Avoids depending on `@webgpu/types` (which is shipped transitively via
// transformers.js but not declared by this package).
interface GPUAdapterInfoLike {
  architecture?: string
  description?: string
  device?: string
  vendor?: string
}

interface GPUAdapterLike {
  info?: GPUAdapterInfoLike
  limits?: { maxBufferSize?: number }
  requestAdapterInfo?: () => Promise<GPUAdapterInfoLike>
}

let cachedResult: null | WebGPUCapabilities = null
let pendingDetection: null | Promise<WebGPUCapabilities> = null

// NOTICE: User override for VRAM estimation. When set, this value takes
// priority over all heuristics. Useful for users with known hardware where
// the heuristic is inaccurate (e.g. discrete GPUs with small maxBufferSize).
let vramOverride: null | number = null

// Cached heuristic value so we can restore it when the override is cleared.
// Computed during detectWebGPU() and persisted for the lifetime of the cache.
let cachedHeuristicVRAM = 0

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

      let adapterInfo: null | WebGPUAdapterInfo = null
      let heuristic = 0
      if (result.supported && result.adapter) {
        heuristic = computeHeuristicVRAM(result.adapter)
        adapterInfo = await extractAdapterInfo(result.adapter)
      }

      cachedHeuristicVRAM = heuristic
      const vram = resolveVRAM(heuristic)

      cachedResult = {
        adapterInfo,
        estimatedVRAM: vram.bytes,
        estimatedVRAMSource: vram.source,
        fp16Supported: result.fp16Supported ?? false,
        reason: result.reason ?? '',
        supported: result.supported,
      }
    }
    catch {
      cachedHeuristicVRAM = 0
      cachedResult = {
        adapterInfo: null,
        estimatedVRAM: 0,
        estimatedVRAMSource: 'none',
        fp16Supported: false,
        reason: 'Detection threw an exception',
        supported: false,
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
export function getCachedWebGPUCapabilities(): null | WebGPUCapabilities {
  return cachedResult
}

/** Read the current VRAM override, or null if unset. */
export function getEstimatedVRAMOverride(): null | number {
  return vramOverride
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
  cachedHeuristicVRAM = 0
}

/**
 * Override the estimated VRAM value. Pass `null` to clear the override and
 * revert to the heuristic. The override applies to future detections, and if
 * a result is already cached its VRAM fields are updated immediately, so
 * `resetWebGPUCache()` is not required.
 *
 * Intended for user preference UI ("I have 8 GB VRAM") and testing.
 */
export function setEstimatedVRAMOverride(bytes: null | number): void {
  if (bytes !== null && (!Number.isFinite(bytes) || bytes < 0))
    throw new Error(`Invalid VRAM override: ${bytes} (expected null or non-negative finite number)`)

  vramOverride = bytes

  // If we already have a cached result, update it in-place so consumers
  // see the new value without needing to call resetWebGPUCache(). The
  // original heuristic value is preserved in `cachedHeuristicVRAM` so we
  // can revert when the override is cleared.
  if (cachedResult) {
    const vram = resolveVRAM(cachedHeuristicVRAM)
    cachedResult = {
      ...cachedResult,
      estimatedVRAM: vram.bytes,
      estimatedVRAMSource: vram.source,
    }
  }
}

/** Compute the heuristic VRAM estimate from `maxBufferSize`. */
function computeHeuristicVRAM(adapter: GPUAdapterLike): number {
  const maxBuffer = adapter.limits?.maxBufferSize ?? 0
  // Typical values: 256 MB on integrated GPUs, 2-4 GB on discrete.
  // Multiply by 4 as a conservative total VRAM heuristic.
  return maxBuffer > 0 ? maxBuffer * 4 : 0
}

/**
 * Best-effort extraction of `GPUAdapterInfo` from a `GPUAdapter`. Tries
 * the modern synchronous `adapter.info` first, then falls back to the
 * legacy `requestAdapterInfo()` promise API. Returns null if neither works.
 *
 * References:
 *   - https://www.w3.org/TR/webgpu/#gpu-adapterinfo
 */
async function extractAdapterInfo(adapter: GPUAdapterLike): Promise<null | WebGPUAdapterInfo> {
  try {
    // Modern API: synchronous `info` property (Chrome 114+, Safari 17.4+)
    const info = adapter.info
    if (info) {
      return {
        architecture: info.architecture ?? '',
        description: info.description ?? '',
        device: info.device ?? '',
        vendor: info.vendor ?? '',
      }
    }

    // Legacy API: requestAdapterInfo() returns a Promise
    const legacy = adapter.requestAdapterInfo
    if (typeof legacy === 'function') {
      const legacyInfo = await legacy.call(adapter)
      return {
        architecture: legacyInfo.architecture ?? '',
        description: legacyInfo.description ?? '',
        device: legacyInfo.device ?? '',
        vendor: legacyInfo.vendor ?? '',
      }
    }
  }
  catch {
    // Fall through to null — adapter info is best-effort, not required
  }
  return null
}

/** Decide the VRAM estimate based on override > heuristic > none. */
function resolveVRAM(heuristic: number): { bytes: number, source: VRAMSource } {
  if (vramOverride !== null && vramOverride > 0)
    return { bytes: vramOverride, source: 'override' }
  if (heuristic > 0)
    return { bytes: heuristic, source: 'max-buffer-heuristic' }
  return { bytes: 0, source: 'none' }
}

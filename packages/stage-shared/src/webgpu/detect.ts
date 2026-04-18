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

// Minimal structural subset of the WebGPU types we interact with.
// Avoids depending on `@webgpu/types` (which is shipped transitively via
// transformers.js but not declared by this package).
interface GPUAdapterInfoLike {
  vendor?: string
  architecture?: string
  device?: string
  description?: string
}

interface GPUAdapterLike {
  limits?: { maxBufferSize?: number }
  info?: GPUAdapterInfoLike
  requestAdapterInfo?: () => Promise<GPUAdapterInfoLike>
}

/**
 * Subset of `GPUAdapterInfo` that we surface to consumers. Values come
 * directly from the browser's WebGPU implementation — treat them as
 * opaque strings; vendor/architecture naming is not standardized.
 */
export interface WebGPUAdapterInfo {
  /** Vendor name, e.g. "nvidia", "apple", "intel" */
  vendor: string
  /** Architecture name, e.g. "ada-lovelace", "apple-m1" */
  architecture: string
  /** Device description, e.g. "NVIDIA GeForce RTX 4090" */
  device: string
  /** Free-form description string from the driver */
  description: string
}

/**
 * Source of the VRAM estimate, reported for observability.
 * - `override`: user-provided value via `setEstimatedVRAMOverride()`
 * - `max-buffer-heuristic`: derived from `adapter.limits.maxBufferSize * 4`
 * - `none`: no estimate available (WebGPU unsupported or adapter query failed)
 */
export type VRAMSource = 'override' | 'max-buffer-heuristic' | 'none'

export interface WebGPUCapabilities {
  /** Whether WebGPU is available in this environment */
  supported: boolean
  /** Whether fp16 shader operations are supported */
  fp16Supported: boolean
  /** Estimated VRAM in bytes (0 when unavailable) */
  estimatedVRAM: number
  /** Provenance of the VRAM estimate */
  estimatedVRAMSource: VRAMSource
  /** Adapter-reported vendor/architecture/device info, when available */
  adapterInfo: WebGPUAdapterInfo | null
  /** Raw reason string from gpuu when unsupported */
  reason: string
}

let cachedResult: WebGPUCapabilities | null = null
let pendingDetection: Promise<WebGPUCapabilities> | null = null

// NOTICE: User override for VRAM estimation. When set, this value takes
// priority over all heuristics. Useful for users with known hardware where
// the heuristic is inaccurate (e.g. discrete GPUs with small maxBufferSize).
let vramOverride: number | null = null

// Cached heuristic value so we can restore it when the override is cleared.
// Computed during detectWebGPU() and persisted for the lifetime of the cache.
let cachedHeuristicVRAM = 0

/**
 * Best-effort extraction of `GPUAdapterInfo` from a `GPUAdapter`. Tries
 * the modern synchronous `adapter.info` first, then falls back to the
 * legacy `requestAdapterInfo()` promise API. Returns null if neither works.
 *
 * References:
 *   - https://www.w3.org/TR/webgpu/#gpu-adapterinfo
 */
async function extractAdapterInfo(adapter: GPUAdapterLike): Promise<WebGPUAdapterInfo | null> {
  try {
    // Modern API: synchronous `info` property (Chrome 114+, Safari 17.4+)
    const info = adapter.info
    if (info) {
      return {
        vendor: info.vendor ?? '',
        architecture: info.architecture ?? '',
        device: info.device ?? '',
        description: info.description ?? '',
      }
    }

    // Legacy API: requestAdapterInfo() returns a Promise
    const legacy = adapter.requestAdapterInfo
    if (typeof legacy === 'function') {
      const legacyInfo = await legacy.call(adapter)
      return {
        vendor: legacyInfo.vendor ?? '',
        architecture: legacyInfo.architecture ?? '',
        device: legacyInfo.device ?? '',
        description: legacyInfo.description ?? '',
      }
    }
  }
  catch {
    // Fall through to null — adapter info is best-effort, not required
  }
  return null
}

/** Compute the heuristic VRAM estimate from `maxBufferSize`. */
function computeHeuristicVRAM(adapter: GPUAdapterLike): number {
  const maxBuffer = adapter.limits?.maxBufferSize ?? 0
  // Typical values: 256 MB on integrated GPUs, 2-4 GB on discrete.
  // Multiply by 4 as a conservative total VRAM heuristic.
  return maxBuffer > 0 ? maxBuffer * 4 : 0
}

/** Decide the VRAM estimate based on override > heuristic > none. */
function resolveVRAM(heuristic: number): { bytes: number, source: VRAMSource } {
  if (vramOverride !== null && vramOverride > 0)
    return { bytes: vramOverride, source: 'override' }
  if (heuristic > 0)
    return { bytes: heuristic, source: 'max-buffer-heuristic' }
  return { bytes: 0, source: 'none' }
}

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

      let adapterInfo: WebGPUAdapterInfo | null = null
      let heuristic = 0
      if (result.supported && result.adapter) {
        heuristic = computeHeuristicVRAM(result.adapter)
        adapterInfo = await extractAdapterInfo(result.adapter)
      }

      cachedHeuristicVRAM = heuristic
      const vram = resolveVRAM(heuristic)

      cachedResult = {
        supported: result.supported,
        fp16Supported: result.fp16Supported ?? false,
        estimatedVRAM: vram.bytes,
        estimatedVRAMSource: vram.source,
        adapterInfo,
        reason: result.reason ?? '',
      }
    }
    catch {
      cachedHeuristicVRAM = 0
      cachedResult = {
        supported: false,
        fp16Supported: false,
        estimatedVRAM: 0,
        estimatedVRAMSource: 'none',
        adapterInfo: null,
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
 * Override the estimated VRAM value. Pass `null` to clear the override and
 * revert to the heuristic. The override takes effect on the next call to
 * `detectWebGPU()` — if the result is already cached, also call
 * `resetWebGPUCache()` to force re-detection.
 *
 * Intended for user preference UI ("I have 8 GB VRAM") and testing.
 */
export function setEstimatedVRAMOverride(bytes: number | null): void {
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

/** Read the current VRAM override, or null if unset. */
export function getEstimatedVRAMOverride(): number | null {
  return vramOverride
}

/**
 * Reset the cached detection result. Intended for tests only.
 */
export function resetWebGPUCache(): void {
  cachedResult = null
  pendingDetection = null
  cachedHeuristicVRAM = 0
}

/**
 * Model cache utilities.
 *
 * Local inference models are cached by two different backends:
 * - `@huggingface/transformers` and `kokoro-js` cache downloaded files via the
 *   browser Cache API automatically (bucket {@link TRANSFORMERS_CACHE_NAME}).
 * - web-rwkv persists its converted f16 weights to OPFS (see the web-rwkv worker
 *   `cache` module).
 *
 * This module unifies both behind a single query/management surface for the
 * settings UI ("Cached 512 MB", "Clear model cache" button), so callers don't
 * need to know which backend a given model uses.
 */

import type { CachedModelEntry } from '../../workers/web-rwkv/cache'

import { clearCache as clearWebRwkvWeightCache, deleteCachedModel as deleteWebRwkvCachedModel, getCacheSize as getWebRwkvWeightCacheSize, isCached as isWebRwkvModelCached, listCachedModels as listWebRwkvCachedModels } from '../../workers/web-rwkv/cache'

// The cache name used by transformers.js / ONNX runtime
const TRANSFORMERS_CACHE_NAME = 'transformers-cache'

export type { CachedModelEntry }
export { deleteWebRwkvCachedModel, isWebRwkvModelCached, listWebRwkvCachedModels }

/**
 * Get the total size of cached model files in bytes.
 * Returns 0 if the Cache API is unavailable or the cache is empty.
 */
export async function getModelCacheSize(): Promise<number> {
  let totalSize = 0

  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(TRANSFORMERS_CACHE_NAME)
      const keys = await cache.keys()

      for (const request of keys) {
        const response = await cache.match(request)
        if (response) {
          // Content-Length header if available
          const cl = response.headers.get('content-length')
          if (cl) {
            totalSize += Number.parseInt(cl, 10)
          }
          else {
            // Fallback: read the body to measure size
            const blob = await response.blob()
            totalSize += blob.size
          }
        }
      }
    }
    catch {
      // Cache API unavailable or empty; fall through to the OPFS backend below.
    }
  }

  // web-rwkv stores converted f16 weights in OPFS rather than the Cache API, so
  // add it separately to report a single total across both backends.
  totalSize += await getWebRwkvWeightCacheSize()

  return totalSize
}

/**
 * Clear all cached model files.
 */
export async function clearModelCache(): Promise<void> {
  if (typeof caches !== 'undefined') {
    try {
      await caches.delete(TRANSFORMERS_CACHE_NAME)
    }
    catch {
      // Silently ignore if cache doesn't exist
    }
  }

  // web-rwkv weights live in OPFS; clear them through the worker cache's helper.
  await clearWebRwkvWeightCache()
}

/**
 * Check whether a specific model has cached files.
 * Matches by looking for cache entries whose URL contains the model ID.
 */
export async function isModelCached(modelId: string): Promise<boolean> {
  if (typeof caches === 'undefined')
    return false

  try {
    const cache = await caches.open(TRANSFORMERS_CACHE_NAME)
    const keys = await cache.keys()
    return keys.some(request => request.url.includes(modelId))
  }
  catch {
    return false
  }
}

/**
 * Format bytes into a human-readable string (e.g. "512 MB").
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0)
    return '0 B'

  const units = ['B', 'KB', 'MB', 'GB']
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const value = bytes / k ** i

  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

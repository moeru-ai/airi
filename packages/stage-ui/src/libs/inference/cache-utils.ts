/**
 * Model cache utilities.
 *
 * `@huggingface/transformers` and `kokoro-js` cache downloaded model
 * files via the browser Cache API automatically. This module provides
 * query and management functions for that cache, intended for settings
 * UI ("Cached 512 MB", "Clear model cache" button).
 */

// The cache name used by transformers.js / ONNX runtime
const TRANSFORMERS_CACHE_NAME = 'transformers-cache'

/**
 * Get the total size of cached model files in bytes.
 * Returns 0 if the Cache API is unavailable or the cache is empty.
 */
export async function getModelCacheSize(): Promise<number> {
  if (typeof caches === 'undefined')
    return 0

  try {
    const cache = await caches.open(TRANSFORMERS_CACHE_NAME)
    const keys = await cache.keys()

    let totalSize = 0
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

    return totalSize
  }
  catch {
    return 0
  }
}

/**
 * Clear all cached model files.
 */
export async function clearModelCache(): Promise<void> {
  if (typeof caches === 'undefined')
    return

  try {
    await caches.delete(TRANSFORMERS_CACHE_NAME)
  }
  catch {
    // Silently ignore if cache doesn't exist
  }
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

/**
 * Model cache utilities.
 *
 * Transformers and Kokoro cache model files automatically. Sherpaw uses this
 * module to cache remote model files. Settings can report and clear both caches.
 */

// The cache name used by transformers.js / ONNX runtime
const TRANSFORMERS_CACHE_NAME = 'transformers-cache'
const SHERPAW_CACHE_NAME = 'sherpaw-models'
const MODEL_CACHE_NAMES = [TRANSFORMERS_CACHE_NAME, SHERPAW_CACHE_NAME]

/** Stores successful Sherpaw model downloads for later speech segments and sessions. */
export async function fetchCachedModel(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof caches === 'undefined')
    return await fetch(input, init)

  let cache: Cache
  try {
    cache = await caches.open(SHERPAW_CACHE_NAME)
    const cached = await cache.match(input)
    if (cached)
      return cached
  }
  catch {
    return await fetch(input, init)
  }

  const response = await fetch(input, init)
  if (response.ok) {
    try {
      await cache.put(input, response.clone())
    }
    catch {
      // Storage failure must not prevent speech recognition.
    }
  }
  return response
}

/**
 * Get the total size of cached model files in bytes.
 * Returns 0 if the Cache API is unavailable or the cache is empty.
 */
export async function getModelCacheSize(): Promise<number> {
  if (typeof caches === 'undefined')
    return 0

  try {
    let totalSize = 0
    for (const name of MODEL_CACHE_NAMES) {
      const cache = await caches.open(name)
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
    await Promise.all(MODEL_CACHE_NAMES.map(name => caches.delete(name)))
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
    for (const name of MODEL_CACHE_NAMES) {
      const cache = await caches.open(name)
      const keys = await cache.keys()
      if (keys.some(request => request.url.includes(modelId)))
        return true
    }
    return false
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

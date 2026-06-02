/**
 * Weight/vocab fetching for the web-rwkv worker, backed by the Cache Storage API.
 *
 * RWKV f16 `safetensors` are large (≈0.4-5.9 GB), and web-rwkv quantizes them
 * on-device — so quantization shrinks VRAM, never the download. Caching the raw
 * responses keeps a model switch (or a reload after the worker is recycled)
 * from re-downloading multiple gigabytes. Downloads are streamed so callers can
 * render byte-level progress instead of a spinner that hangs for minutes.
 */

/** Byte-level download progress. */
export interface FetchProgress {
  /** Bytes received so far. */
  loaded: number
  /** Total bytes from `content-length`, or 0 when the server didn't report it. */
  total: number
}

export interface FetchOptions {
  /** Aborts the in-flight network read. */
  signal?: AbortSignal
  /** Called as bytes arrive (cache hits resolve without intermediate calls). */
  onProgress?: (progress: FetchProgress) => void
}

/**
 * Cache name. Bump the version suffix to invalidate every cached weight when
 * the on-disk format or URL scheme changes.
 */
const WEIGHTS_CACHE = 'rwkv-weights-v1'

/**
 * Fetch a URL as an `ArrayBuffer`, persisting it in the Cache Storage API.
 *
 * Use when:
 * - Downloading RWKV weights or the vocab JSON, where re-fetching multi-GB
 *   files on every load is unacceptable.
 *
 * Expects:
 * - A same-origin or CORS-readable `url`. In environments without `caches`
 *   (e.g. a non-secure context or a unit test), it transparently degrades to a
 *   plain streamed `fetch` with no persistence.
 *
 * Returns:
 * - The full response body. On a cache hit the body still streams through
 *   `onProgress` (instantly), so progress UIs behave the same either way.
 */
export async function fetchCached(url: string, options?: FetchOptions): Promise<ArrayBuffer> {
  const cache = typeof caches !== 'undefined' ? await caches.open(WEIGHTS_CACHE) : undefined
  const hit = cache ? await cache.match(url) : undefined

  const response = hit ?? await fetch(url, { signal: options?.signal })
  if (!response.ok)
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)

  const total = Number(response.headers.get('content-length') ?? 0)
  const buffer = await readWithProgress(response, total, options)

  // Best-effort persist on a miss; a full cache (quota) must not fail the load.
  if (cache && !hit)
    await cache.put(url, new Response(buffer)).catch(() => {})

  return buffer
}

/**
 * Fetch a URL as UTF-8 text (the World tokenizer vocab JSON), cached as above.
 */
export async function fetchCachedText(url: string, options?: FetchOptions): Promise<string> {
  const buffer = await fetchCached(url, options)
  return new TextDecoder().decode(buffer)
}

/**
 * Drain a `Response` body into one `ArrayBuffer` while reporting byte progress.
 *
 * Falls back to `response.arrayBuffer()` when the body is not a readable stream
 * (so no incremental progress, but still correct).
 */
async function readWithProgress(response: Response, total: number, options?: FetchOptions): Promise<ArrayBuffer> {
  if (!response.body)
    return response.arrayBuffer()

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0

  for (;;) {
    if (options?.signal?.aborted) {
      await reader.cancel()
      throw new DOMException('The operation was aborted', 'AbortError')
    }
    const { done, value } = await reader.read()
    if (done)
      break
    chunks.push(value)
    loaded += value.byteLength
    options?.onProgress?.({ loaded, total })
  }

  // Concatenate into a single contiguous buffer for the wasm reader.
  const out = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return out.buffer
}

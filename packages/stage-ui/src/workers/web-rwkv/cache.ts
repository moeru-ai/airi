/**
 * OPFS (Origin Private File System) cache for converted web-rwkv weights.
 *
 * The worker normally fetches a safetensors checkpoint over HTTP Range and casts
 * every tensor to f16 (see `./safetensors`) on each load — hundreds of MB of
 * download plus a CPU cast, repeated on every page reload. This module persists
 * the *converted* f16 tensors to OPFS so subsequent loads skip both the network
 * and the cast.
 *
 * Why f16 (not the raw checkpoint): the cast is one-way and lossy-shaped (bf16/f32
 * → f16), so caching the converted bytes is half the disk of an f32 checkpoint and
 * removes the per-load cast. Why OPFS (not localStorage/Cache API): weights are
 * tens of MB to multi-GB — far past localStorage's ~5 MB string quota — and the
 * worker-only synchronous access handle gives fast random-access writes/reads
 * without buffering the whole model in JS.
 *
 * File layout (one file per model):
 *
 *   [ tensor data, concatenated in write order ]
 *   [ index JSON: { v, url, tensors: [{ name, shape, offset, byteLength }, …] } ]
 *   [ 8-byte footer: index JSON byte length (little-endian u64) ]
 *
 * The index records the source model URL so a listing can label complete entries
 * by the model they belong to (the filename is only the URL's hash, not the URL).
 *
 * The index is written last (its size isn't known until all tensors are in), and
 * a read validates the footer + total size before trusting the file, so an
 * aborted/partial write is detected and re-downloaded rather than read as garbage.
 *
 * This module is pure IO + serialization (no wasm): it deals in plain
 * {@link CachedTensor} parts and lets the worker construct wasm `Tensor`s via the
 * mapper passed to {@link readCachedModel}, keeping the cache decoupled from the
 * model runtime and avoiding a second full-model copy on the hit path.
 */

/** Serializable form of one converted weight tensor (little-endian f16 bytes). */
export interface CachedTensor {
  /** Tensor name as it appears in the safetensors header. */
  name: string
  /** Oriented (post-transpose) row-major shape. */
  shape: number[]
  /** Little-endian f16 bytes (2 bytes/element). */
  data: Uint8Array
}

/**
 * Write sink for streaming converted tensors to OPFS during a model download.
 *
 * Tensors are written through as they are produced (no full-model buffering);
 * {@link ModelCacheWriter.finalize} appends the index + footer to commit the file,
 * and {@link ModelCacheWriter.abort} discards a partial file on error/abort.
 */
export interface ModelCacheWriter {
  /**
   * Persist one tensor's f16 bytes. `index` is its header order (so the index is
   * emitted in header order regardless of which concurrent fetch finished first);
   * the on-disk byte offset is assigned in call order.
   */
  add: (index: number, tensor: CachedTensor) => void
  /** Append the index + footer and close the file, committing the cache entry. */
  finalize: () => Promise<void>
  /** Close and delete the (partial) file. Safe to call after any failure. */
  abort: () => Promise<void>
}

/** Per-tensor record in the on-disk index. */
interface IndexEntry {
  name: string
  shape: number[]
  offset: number
  byteLength: number
}

/** Bump when the on-disk layout changes; older files then fail validation and re-download. */
const FORMAT_VERSION = 2
/** Footer is a single little-endian u64 holding the index JSON byte length. */
const FOOTER_BYTES = 8
/** OPFS subdirectory holding one file per cached model. */
const CACHE_DIR = 'web-rwkv'
/** Extension for each per-model cache file; the stem is the model key (URL hash). */
const FILE_SUFFIX = '.f16cache'

/**
 * Minimal synchronous access handle shape (worker-only OPFS API). Declared
 * locally so the cache compiles regardless of whether the ambient DOM lib in use
 * includes `FileSystemSyncAccessHandle`.
 */
interface SyncAccessHandle {
  read: (buffer: AllowSharedBufferSource, options?: { at?: number }) => number
  write: (buffer: AllowSharedBufferSource, options?: { at?: number }) => number
  truncate: (newSize: number) => void
  getSize: () => number
  flush: () => void
  close: () => void
}

type FileHandleWithSync = FileSystemFileHandle & {
  createSyncAccessHandle: () => Promise<SyncAccessHandle>
}

/**
 * Async-iterable shape of an OPFS directory. Declared locally because
 * `FileSystemDirectoryHandle.values()` lives in `lib.dom.asynciterable` and isn't
 * guaranteed by the ambient DOM lib in use — same reason {@link SyncAccessHandle}
 * is declared here rather than relied on from the global types.
 */
type DirectoryHandleIterable = FileSystemDirectoryHandle & {
  values: () => AsyncIterableIterator<FileSystemHandle>
}

/** OPFS + worker-only sync access handles are required; otherwise caching is skipped. */
function opfsAvailable(): boolean {
  return typeof navigator !== 'undefined'
    && !!navigator.storage
    && typeof navigator.storage.getDirectory === 'function'
}

/** Open (optionally creating) the model cache directory in OPFS. */
async function openCacheDir(create: boolean): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle(CACHE_DIR, { create })
}

/** Cache filename for a model key. */
function cacheFileName(key: string): string {
  return `${key}${FILE_SUFFIX}`
}

/**
 * Derive a stable, filesystem-safe cache key from a model URL.
 *
 * Use when:
 * - Keying {@link createCacheWriter}/{@link readCachedModel} for a model.
 *
 * Expects:
 * - The *stable* model URL (e.g. an HF `resolve/main` URL), not a signed CDN URL —
 *   signed URLs carry per-request query params and would never cache-hit.
 *
 * Returns:
 * - The lowercase hex SHA-256 of the URL.
 */
export async function cacheKeyForModel(modelUrl: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(modelUrl))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

/** No-op writer used when OPFS is unavailable or the file can't be opened. */
const NOOP_WRITER: ModelCacheWriter = {
  add() {},
  async finalize() {},
  async abort() {},
}

/**
 * Open a streaming OPFS writer for a model's converted f16 tensors.
 *
 * Use when:
 * - About to download + convert a model whose weights should be cached.
 *
 * Expects:
 * - `modelUrl` is the stable source URL; it is stored in the index so a later
 *   listing can label this entry by the model it belongs to.
 *
 * Returns:
 * - A {@link ModelCacheWriter}. Falls back to a no-op writer when OPFS is
 *   unavailable, or when the file is already locked (e.g. a concurrent load of the
 *   same model) — caching is best-effort and never blocks the load.
 */
export async function createCacheWriter(key: string, modelUrl: string): Promise<ModelCacheWriter> {
  if (!opfsAvailable()) {
    console.warn('[web-rwkv:cache] OPFS unavailable; weights will not be cached')
    return NOOP_WRITER
  }

  let handle: SyncAccessHandle
  try {
    const dir = await openCacheDir(true)
    const fileHandle = await dir.getFileHandle(cacheFileName(key), { create: true }) as FileHandleWithSync
    if (typeof fileHandle.createSyncAccessHandle !== 'function') {
      console.warn('[web-rwkv:cache] createSyncAccessHandle unavailable here (worker-only API); weights will not be cached')
      return NOOP_WRITER
    }
    handle = await fileHandle.createSyncAccessHandle()
    handle.truncate(0)
  }
  catch (error) {
    console.warn('[web-rwkv:cache] could not open cache file for writing; weights will not be cached', error)
    return NOOP_WRITER
  }

  // Caching is best-effort: a write failure (quota, lock, …) must never break the
  // model load. The first failure latches `failed`, disabling further writes; the
  // partial file is dropped on finalize.
  let failed = false
  // Cursor and index live in closure state; `add` runs synchronously between
  // awaits in the worker's concurrent fetch loop, so offset assignment is atomic.
  let cursor = 0
  const entries: IndexEntry[] = []

  async function deleteFile(): Promise<void> {
    try {
      const dir = await openCacheDir(false)
      await dir.removeEntry(cacheFileName(key))
    }
    catch {}
  }

  function closeHandle(): void {
    try {
      handle.close()
    }
    catch {}
  }

  return {
    add(index, tensor) {
      if (failed)
        return
      try {
        const byteLength = tensor.data.byteLength
        const offset = cursor
        handle.write(tensor.data, { at: offset })
        cursor += byteLength
        // Slot by header index so the index array is in header order regardless of
        // which concurrent write landed first.
        entries[index] = { name: tensor.name, shape: tensor.shape, offset, byteLength }
      }
      catch (error) {
        failed = true
        console.warn('[web-rwkv:cache] tensor write failed; disabling cache for this load', error)
      }
    },
    async finalize() {
      if (failed) {
        closeHandle()
        await deleteFile()
        return
      }
      try {
        const indexBytes = new TextEncoder().encode(JSON.stringify({ v: FORMAT_VERSION, url: modelUrl, tensors: entries }))
        handle.write(indexBytes, { at: cursor })
        const footer = new DataView(new ArrayBuffer(FOOTER_BYTES))
        footer.setBigUint64(0, BigInt(indexBytes.byteLength), true)
        handle.write(new Uint8Array(footer.buffer), { at: cursor + indexBytes.byteLength })
        handle.flush()
        handle.close()
        console.info(`[web-rwkv:cache] cached ${entries.length} tensors (${cursor} bytes) for ${key.slice(0, 12)}…`)
      }
      catch (error) {
        console.warn('[web-rwkv:cache] finalize failed; dropping partial cache file', error)
        closeHandle()
        await deleteFile()
      }
    },
    async abort() {
      closeHandle()
      await deleteFile()
    },
  }
}

/**
 * Read a cached model's converted f16 tensors, in header order.
 *
 * Use when:
 * - Loading a model, to skip the download + f16 cast on a cache hit.
 *
 * Expects:
 * - `mapTensor` builds the caller's per-tensor value (e.g. a wasm `Tensor`). It is
 *   called once per tensor as the bytes are read; the temporary {@link CachedTensor}
 *   is dropped afterward, so the full model is never held twice in memory.
 *
 * Returns:
 * - The mapped tensors in header order, or `null` on a miss (no file) or any
 *   validation failure (corrupt/partial/old-format file — which is then deleted).
 *
 * @typeParam T - The per-tensor value produced by `mapTensor`.
 */
export async function readCachedModel<T>(key: string, mapTensor: (tensor: CachedTensor) => T): Promise<T[] | null> {
  if (!opfsAvailable())
    return null

  // A missing dir/file is a normal miss (first load, or after a clear); resolve it
  // quietly and separately from the corrupt-file path below, which warns + deletes.
  let dir: FileSystemDirectoryHandle
  let fileHandle: FileHandleWithSync
  try {
    dir = await openCacheDir(false)
    fileHandle = await dir.getFileHandle(cacheFileName(key)) as FileHandleWithSync
  }
  catch {
    console.info(`[web-rwkv:cache] miss for ${key.slice(0, 12)}… (no cached file yet)`)
    return null
  }

  let handle: SyncAccessHandle | undefined
  try {
    handle = await fileHandle.createSyncAccessHandle()

    const size = handle.getSize()
    if (size < FOOTER_BYTES)
      throw new Error('web-rwkv cache: file smaller than footer')

    const footer = new Uint8Array(FOOTER_BYTES)
    handle.read(footer, { at: size - FOOTER_BYTES })
    const indexLen = Number(new DataView(footer.buffer).getBigUint64(0, true))
    if (indexLen <= 0 || indexLen > size - FOOTER_BYTES)
      throw new Error('web-rwkv cache: implausible index length')

    const dataEnd = size - FOOTER_BYTES - indexLen
    const indexBytes = new Uint8Array(indexLen)
    handle.read(indexBytes, { at: dataEnd })
    const parsed = JSON.parse(new TextDecoder().decode(indexBytes)) as { v: number, tensors: IndexEntry[] }
    if (parsed.v !== FORMAT_VERSION || !Array.isArray(parsed.tensors))
      throw new Error('web-rwkv cache: unsupported format')

    // The data block must exactly fill the space before the index — guards against
    // a truncated/partial file whose footer happens to parse.
    const dataBytes = parsed.tensors.reduce((sum, e) => sum + e.byteLength, 0)
    if (dataBytes !== dataEnd)
      throw new Error('web-rwkv cache: data size mismatch')

    const mapped = parsed.tensors.map((entry) => {
      const data = new Uint8Array(entry.byteLength)
      handle!.read(data, { at: entry.offset })
      return mapTensor({ name: entry.name, shape: entry.shape, data })
    })
    handle.close()
    console.info(`[web-rwkv:cache] hit for ${key.slice(0, 12)}… (${parsed.tensors.length} tensors, ${dataEnd} bytes)`)
    return mapped
  }
  catch (error) {
    try {
      handle?.close()
    }
    catch {}
    // Drop a corrupt/partial/old-format file so the next load re-downloads cleanly.
    console.warn('[web-rwkv:cache] cached file unusable; dropping and re-downloading', error)
    try {
      await dir.removeEntry(cacheFileName(key))
    }
    catch {}
    return null
  }
}

/** One file in the OPFS weight cache, as surfaced to settings UI. */
export interface CachedModelEntry {
  /** SHA-256 hex of the model URL — the on-disk filename stem and delete key. */
  key: string
  /** Total bytes the file occupies on disk. */
  sizeBytes: number
  /**
   * `complete` when the footer + index validate (a fully written, usable cache);
   * `partial` when they don't — a remnant of an aborted/failed write (tab closed
   * mid-download, quota error) or an old/corrupt format. Partial files are dead
   * weight: {@link readCachedModel} rejects them, so they only consume space.
   */
  status: 'complete' | 'partial'
  /** Source model URL, recovered from the index. Absent for `partial` entries. */
  url?: string
}

/**
 * Read a cache file's footer + index to classify it, without reading tensor data.
 *
 * Mirrors {@link readCachedModel}'s validation (footer plausibility, format
 * version, data-size invariant) but on the main thread via {@link File} slices
 * rather than worker-only sync handles, so it is safe to call from settings UI.
 * Any failure to validate downgrades the entry to `partial` rather than throwing.
 */
async function describeCacheFile(key: string, file: File): Promise<CachedModelEntry> {
  const size = file.size
  const partial: CachedModelEntry = { key, sizeBytes: size, status: 'partial' }
  try {
    if (size < FOOTER_BYTES)
      return partial

    const footer = new DataView(await file.slice(size - FOOTER_BYTES, size).arrayBuffer())
    const indexLen = Number(footer.getBigUint64(0, true))
    if (indexLen <= 0 || indexLen > size - FOOTER_BYTES)
      return partial

    const dataEnd = size - FOOTER_BYTES - indexLen
    const indexBytes = await file.slice(dataEnd, dataEnd + indexLen).arrayBuffer()
    const parsed = JSON.parse(new TextDecoder().decode(indexBytes)) as { v: number, url?: string, tensors: IndexEntry[] }
    if (parsed.v !== FORMAT_VERSION || !Array.isArray(parsed.tensors))
      return partial

    // The data block must exactly fill the space before the index (same guard as
    // the read path) — a truncated file whose footer happens to parse is partial.
    const dataBytes = parsed.tensors.reduce((sum, e) => sum + e.byteLength, 0)
    if (dataBytes !== dataEnd)
      return partial

    return { key, sizeBytes: size, status: 'complete', url: parsed.url }
  }
  catch {
    return partial
  }
}

/**
 * List every file in the OPFS weight cache, complete and partial alike.
 *
 * Use when:
 * - Rendering a per-entry cache manager (size, status, delete) in settings, so
 *   orphaned models and failed-download remnants are visible and removable.
 *
 * Returns:
 * - One {@link CachedModelEntry} per cache file (unordered), or `[]` when OPFS is
 *   unavailable or nothing is cached yet.
 */
export async function listCachedModels(): Promise<CachedModelEntry[]> {
  if (!opfsAvailable())
    return []

  let dir: FileSystemDirectoryHandle
  try {
    dir = await openCacheDir(false)
  }
  catch {
    return []
  }

  const entries: CachedModelEntry[] = []
  try {
    for await (const handle of (dir as DirectoryHandleIterable).values()) {
      if (handle.kind !== 'file' || !handle.name.endsWith(FILE_SUFFIX))
        continue
      const key = handle.name.slice(0, -FILE_SUFFIX.length)
      const file = await (handle as FileSystemFileHandle).getFile()
      entries.push(await describeCacheFile(key, file))
    }
  }
  catch (error) {
    console.warn('[web-rwkv:cache] could not list cache entries', error)
  }
  return entries
}

/**
 * Total bytes held by the OPFS weight cache across all cached models.
 *
 * Use when:
 * - Reporting cache usage in settings UI alongside the other model caches.
 *
 * Returns:
 * - The summed size of every cache file (complete and partial), or 0 when OPFS is
 *   unavailable or nothing is cached yet.
 */
export async function getCacheSize(): Promise<number> {
  const entries = await listCachedModels()
  return entries.reduce((sum, entry) => sum + entry.sizeBytes, 0)
}

/**
 * Delete the entire OPFS weight cache (all models).
 *
 * Use when:
 * - The user clears model caches from settings.
 *
 * Best-effort: a missing directory or removal failure resolves quietly so a
 * caller's combined "clear all caches" flow never rejects on this backend.
 */
export async function clearCache(): Promise<void> {
  if (!opfsAvailable())
    return
  try {
    const root = await navigator.storage.getDirectory()
    await root.removeEntry(CACHE_DIR, { recursive: true })
  }
  catch {}
}

/**
 * Delete a single cache entry by its key.
 *
 * Use when:
 * - The user removes one model (or a partial remnant) from the cache manager.
 *
 * Expects:
 * - `key` is a {@link CachedModelEntry.key} from {@link listCachedModels}.
 *
 * Best-effort: a missing file resolves quietly.
 */
export async function deleteCachedModel(key: string): Promise<void> {
  if (!opfsAvailable())
    return
  try {
    const dir = await openCacheDir(false)
    await dir.removeEntry(cacheFileName(key))
  }
  catch {}
}

/**
 * Whether converted weights for a model URL are already cached.
 *
 * Use when:
 * - Showing a per-model "Cached / Not cached" indicator in settings.
 *
 * Expects:
 * - The *stable* model URL (the same value passed when writing); it is hashed with
 *   {@link cacheKeyForModel} to locate the file.
 */
export async function isCached(modelUrl: string): Promise<boolean> {
  if (!opfsAvailable())
    return false
  try {
    const key = await cacheKeyForModel(modelUrl)
    const dir = await openCacheDir(false)
    await dir.getFileHandle(cacheFileName(key))
    return true
  }
  catch {
    return false
  }
}

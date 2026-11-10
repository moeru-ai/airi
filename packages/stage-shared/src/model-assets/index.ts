import { errorMessageFrom } from '@moeru/std'
import { createFetch, FetchError } from 'ofetch'

/** One version of a model and the files required to load it. */
export interface ModelAsset {
  id: string
  revision: string
  source: 'bundled' | 'remote'
  files: readonly ModelAssetFile[]
}

export interface ModelAssetFile {
  name: string
  url: string
}

export interface ModelAssetProgress {
  file: string
  loaded: number
  total?: number
}

export type ModelAssetState = 'unknown' | 'missing' | 'downloading' | 'installed' | 'bundled' | 'error'

/**
 * Why a model install failed. The interface picks a translated message from `reason`,
 * because raw messages such as `fetch failed` do not tell users what to do.
 */
export interface ModelAssetFailure {
  /**
   * - `network`: the connection to `host` failed or broke during the transfer, for example a timeout or a blocked host.
   * - `server`: `host` answered with a status other than 2xx.
   * - `incomplete`: the transfer ended before the size that the server announced.
   * - `unknown`: any other failure, for example a full disk.
   */
  reason: ModelAssetDownloadFailureReason | 'unknown'
  /** The host of the file URL. Only download failures have it. */
  host?: string
  /** The HTTP status of a `server` failure. */
  status?: number
  /** The raw error message, for logs and for `unknown` failures. */
  message: string
}

export type ModelAssetDownloadFailureReason = 'network' | 'server' | 'incomplete'

/** Storage state is separate from the active inference Worker state. */
export interface ModelAssetStatus {
  id: string
  revision: string
  state: ModelAssetState
  progress?: ModelAssetProgress
  error?: ModelAssetFailure
}

/** A storage adapter throws this error when a model file transfer fails, so the repository can report the reason. */
export class ModelAssetDownloadError extends Error {
  readonly host: string
  readonly status?: number

  constructor(readonly reason: ModelAssetDownloadFailureReason, url: string, options: { status?: number, cause?: unknown } = {}) {
    const host = new URL(url).host
    const details = {
      network: `Could not connect to ${host}: ${errorMessageFrom(options.cause) ?? 'unknown error'}`,
      server: `${host} answered with HTTP ${options.status}`,
      incomplete: `The transfer from ${host} ended early`,
    } satisfies Record<ModelAssetDownloadFailureReason, string>
    super(`Model asset download failed. ${details[reason]}. ${url}`, { cause: options.cause })
    this.name = 'ModelAssetDownloadError'
    this.host = host
    this.status = options.status
  }
}

/**
 * Requests one model file for a storage adapter.
 *
 * ofetch retries one time, at once, after a connection failure or a 408, 409, 425, 429, 500, 502, 503, or 504 status.
 * Aborting `signal` rethrows the abort reason unchanged.
 * Other failures throw {@link ModelAssetDownloadError}.
 *
 * @param download The fetch that sends the request. Tests and the Electron main process pass their own.
 */
export async function requestModelAssetFile(download: typeof fetch, url: string, signal: AbortSignal): Promise<Response> {
  try {
    // `stream` keeps the body unread, so the adapter can write it to storage chunk by chunk.
    return await createFetch({ fetch: download }).raw(url, { signal, responseType: 'stream' })
  }
  catch (error) {
    // ofetch wraps an abort in a FetchError. The repository expects the abort reason itself.
    signal.throwIfAborted()
    if (!(error instanceof FetchError))
      throw error
    // ofetch gives a status only when the host answered.
    if (error.statusCode !== undefined)
      throw new ModelAssetDownloadError('server', url, { status: error.statusCode, cause: error })
    throw new ModelAssetDownloadError('network', url, { cause: error.cause ?? error })
  }
}

/**
 * Reads the next chunk of a model file for a storage adapter.
 *
 * Aborting `signal` rethrows the abort reason unchanged.
 * A connection that breaks during the transfer throws a `network` {@link ModelAssetDownloadError}.
 *
 * @param reader The reader of the response body. `T` is the chunk type that the platform's fetch gives.
 */
export async function readModelAssetChunk<T>(reader: ReadableStreamDefaultReader<T>, url: string, signal: AbortSignal): Promise<ReadableStreamReadResult<T>> {
  try {
    return await reader.read()
  }
  catch (error) {
    signal.throwIfAborted()
    throw new ModelAssetDownloadError('network', url, { cause: error })
  }
}

function failureFrom(error: unknown): ModelAssetFailure {
  const message = errorMessageFrom(error) ?? 'Model download failed'
  if (error instanceof ModelAssetDownloadError)
    return { reason: error.reason, host: error.host, status: error.status, message }
  return { reason: 'unknown', message }
}

/** A platform adapter commits all files before it reports an installed model. */
export interface ModelAssetStorage {
  has: (model: ModelAsset) => Promise<boolean>
  install: (model: ModelAsset, onProgress: (progress: ModelAssetProgress) => void, signal: AbortSignal) => Promise<void>
  open: (model: ModelAsset, file: ModelAssetFile) => Promise<Response>
  remove: (model: ModelAsset) => Promise<void>
  /** Removes every stored model, including models that the catalogue no longer lists. */
  clear: () => Promise<void>
}

/** Owns model-level download, status, and cancellation across one host. */
export class ModelAssetRepository {
  private readonly models = new Map<string, ModelAsset>()
  private readonly statuses = new Map<string, ModelAssetStatus>()
  private readonly listeners = new Set<(status: ModelAssetStatus) => void>()
  private readonly downloads = new Map<string, { controller: AbortController, promise: Promise<void>, waiters: number }>()

  constructor(models: readonly ModelAsset[], private readonly storage: ModelAssetStorage) {
    for (const model of models) {
      if (this.models.has(model.id))
        throw new Error(`Duplicate model asset ID: ${model.id}`)
      if (model.files.length === 0 || new Set(model.files.map(file => file.name)).size !== model.files.length
        || model.files.some(file => !/^[a-z0-9][\w.-]*$/i.test(file.name))) {
        throw new Error(`Invalid model asset files: ${model.id}`)
      }
      this.models.set(model.id, model)
      this.statuses.set(model.id, {
        id: model.id,
        revision: model.revision,
        state: model.source === 'bundled' ? 'bundled' : 'unknown',
      })
    }
  }

  list(): ModelAssetStatus[] {
    return [...this.statuses.values()].map(status => ({ ...status }))
  }

  subscribe(listener: (status: ModelAssetStatus) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async inspect(id: string): Promise<ModelAssetStatus> {
    const model = this.requireModel(id)
    if (model.source === 'bundled')
      return this.requireStatus(id)
    if (this.downloads.has(id))
      return this.requireStatus(id)

    const installed = await this.storage.has(model)
    if (this.downloads.has(id))
      return this.requireStatus(id)
    if (!installed && this.requireStatus(id).state === 'error')
      return this.requireStatus(id)
    return this.update(id, { state: installed ? 'installed' : 'missing', progress: undefined, error: undefined })
  }

  async ensureAvailable(id: string, signal?: AbortSignal): Promise<void> {
    const model = this.requireModel(id)
    if (model.source === 'bundled')
      return
    signal?.throwIfAborted()

    let active = this.downloads.get(id)
    if (active?.controller.signal.aborted) {
      try {
        await active.promise
      }
      catch {
        // Wait for the canceled install to clean its temporary files.
      }
      active = undefined
    }
    if (!active) {
      const controller = new AbortController()
      const promise = this.install(model, controller.signal).finally(() => this.downloads.delete(id))
      void promise.catch(() => {})
      active = { controller, promise, waiters: 0 }
      this.downloads.set(id, active)
    }
    active.waiters++
    const download = active
    let onAbort: (() => void) | undefined
    try {
      if (!signal)
        return await download.promise
      await Promise.race([
        download.promise,
        new Promise<never>((_resolve, reject) => {
          onAbort = () => reject(signal.reason)
          signal.addEventListener('abort', onAbort, { once: true })
          if (signal.aborted)
            onAbort()
        }),
      ])
    }
    finally {
      if (onAbort)
        signal?.removeEventListener('abort', onAbort)
      download.waiters--
      if (download.waiters === 0 && this.downloads.get(id) === download)
        download.controller.abort()
    }
  }

  async cancel(id: string): Promise<void> {
    this.requireModel(id)
    const active = this.downloads.get(id)
    if (!active)
      return
    active.controller.abort()
    try {
      await active.promise
    }
    catch {
      // The aborted install leaves no complete model to expose.
    }
  }

  async remove(id: string): Promise<void> {
    const model = this.requireModel(id)
    if (model.source === 'bundled')
      throw new Error(`Bundled model assets cannot be removed: ${id}`)
    const active = this.downloads.get(id)
    if (active) {
      active.controller.abort()
      try {
        await active.promise
      }
      catch {
        // The canceled transfer leaves no installed model.
      }
    }
    await this.storage.remove(model)
    this.update(id, { state: 'missing', progress: undefined, error: undefined })
  }

  /** Cancels active downloads and removes every stored model. */
  async clear(): Promise<void> {
    const active = [...this.downloads.values()]
    for (const download of active)
      download.controller.abort()
    // The canceled transfers leave no installed model, so their errors do not matter here.
    await Promise.allSettled(active.map(download => download.promise))
    await this.storage.clear()
    for (const model of this.models.values()) {
      if (model.source === 'remote')
        this.update(model.id, { state: 'missing', progress: undefined, error: undefined })
    }
  }

  async open(id: string, fileName: string, signal?: AbortSignal): Promise<Response> {
    const model = this.requireModel(id)
    const file = model.files.find(candidate => candidate.name === fileName)
    if (!file)
      throw new Error(`Unknown model asset file: ${id}/${fileName}`)
    if (model.source === 'bundled')
      return fetch(file.url, { signal })

    await this.ensureAvailable(id, signal)
    signal?.throwIfAborted()
    return this.storage.open(model, file)
  }

  dispose(): void {
    for (const download of this.downloads.values())
      download.controller.abort()
    this.listeners.clear()
  }

  private async install(model: ModelAsset, signal: AbortSignal): Promise<void> {
    const id = model.id
    try {
      if (await this.storage.has(model)) {
        this.update(id, { state: 'installed', progress: undefined, error: undefined })
        return
      }
      this.update(id, { state: 'downloading', progress: undefined, error: undefined })
      await this.storage.install(model, progress => this.update(id, { state: 'downloading', progress }), signal)
      signal.throwIfAborted()
      if (!await this.storage.has(model))
        throw new Error(`Model assets were not committed: ${id}`)
      this.update(id, { state: 'installed', progress: undefined, error: undefined })
    }
    catch (error) {
      this.update(id, signal.aborted
        ? { state: 'missing', progress: undefined, error: undefined }
        : { state: 'error', progress: undefined, error: failureFrom(error) })
      throw error
    }
  }

  private requireModel(id: string): ModelAsset {
    const model = this.models.get(id)
    if (!model)
      throw new Error(`Unknown model asset: ${id}`)
    return model
  }

  private requireStatus(id: string): ModelAssetStatus {
    return { ...this.statuses.get(id)! }
  }

  private update(id: string, change: Partial<ModelAssetStatus>): ModelAssetStatus {
    const status = { ...this.requireStatus(id), ...change }
    this.statuses.set(id, status)
    for (const listener of this.listeners)
      listener({ ...status })
    return { ...status }
  }
}

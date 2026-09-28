import { errorMessageFrom } from '@moeru/std'

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

/** Storage state is separate from the active inference Worker state. */
export interface ModelAssetStatus {
  id: string
  revision: string
  state: ModelAssetState
  progress?: ModelAssetProgress
  error?: string
}

/** A platform adapter commits all files before it reports an installed model. */
export interface ModelAssetStorage {
  has: (model: ModelAsset) => Promise<boolean>
  install: (model: ModelAsset, onProgress: (progress: ModelAssetProgress) => void, signal: AbortSignal) => Promise<void>
  open: (model: ModelAsset, file: ModelAssetFile) => Promise<Response>
  remove: (model: ModelAsset) => Promise<void>
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

  cancel(id: string): void {
    this.requireModel(id)
    this.downloads.get(id)?.controller.abort()
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
        : { state: 'error', progress: undefined, error: errorMessageFrom(error) ?? 'Model download failed' })
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

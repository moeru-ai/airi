import type { ModelAsset, ModelAssetFile, ModelAssetProgress, ModelAssetStorage } from '@proj-airi/stage-shared/model-assets'

import * as v from 'valibot'

const installedModelSchema = v.object({
  revision: v.string(),
  files: v.record(v.string(), v.number()),
})

const DIRECTORY_NAME = 'airi-model-assets'
const MARKER_NAME = 'installed.json'

function isMissing(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError'
}

/** Stores complete model versions in the origin private file system. */
export class OpfsModelAssetStorage implements ModelAssetStorage {
  async has(model: ModelAsset): Promise<boolean> {
    let directory: FileSystemDirectoryHandle
    try {
      directory = await this.modelDirectory(model, false)
    }
    catch (error) {
      if (isMissing(error))
        return false
      throw error
    }

    try {
      const markerFile = await (await directory.getFileHandle(MARKER_NAME)).getFile()
      const parsed = v.safeParse(installedModelSchema, JSON.parse(await markerFile.text()))
      if (!parsed.success)
        return false
      const marker = parsed.output
      if (marker.revision !== model.revision || Object.keys(marker.files).length !== model.files.length)
        return false
      for (const file of model.files) {
        const stored = await (await directory.getFileHandle(file.name)).getFile()
        if (stored.size === 0 || stored.size !== marker.files[file.name])
          return false
      }
      return true
    }
    catch (error) {
      if (isMissing(error) || error instanceof SyntaxError)
        return false
      throw error
    }
  }

  async install(model: ModelAsset, onProgress: (progress: ModelAssetProgress) => void, signal: AbortSignal): Promise<void> {
    await this.removeRevision(model)
    const directory = await this.modelDirectory(model, true)
    const sizes: Record<string, number> = {}
    try {
      for (const file of model.files) {
        signal.throwIfAborted()
        const response = await fetch(file.url, { signal })
        if (!response.ok)
          throw new Error(`Model asset download failed: ${response.status} ${file.url}`)

        const totalHeader = response.headers.get('content-length')
        const parsedTotal = totalHeader ? Number(totalHeader) : undefined
        const total = parsedTotal !== undefined && Number.isFinite(parsedTotal) && parsedTotal >= 0
          ? parsedTotal
          : undefined
        const writable = await (await directory.getFileHandle(file.name, { create: true })).createWritable()
        let loaded = 0
        try {
          if (response.body) {
            const reader = response.body.getReader()
            try {
              while (true) {
                signal.throwIfAborted()
                const { done, value } = await reader.read()
                if (done)
                  break
                await writable.write(value)
                loaded += value.byteLength
                onProgress({ file: file.name, loaded, total })
              }
            }
            finally {
              reader.releaseLock()
            }
          }
          else {
            const bytes = await response.arrayBuffer()
            signal.throwIfAborted()
            await writable.write(bytes)
            loaded = bytes.byteLength
            onProgress({ file: file.name, loaded, total })
          }
          await writable.close()
        }
        catch (error) {
          await writable.abort()
          throw error
        }
        if (loaded === 0 || (total !== undefined && loaded !== total))
          throw new Error(`Incomplete model asset: ${model.id}/${file.name}`)
        sizes[file.name] = loaded
      }

      signal.throwIfAborted()
      const marker = await directory.getFileHandle(MARKER_NAME, { create: true })
      const writable = await marker.createWritable()
      await writable.write(JSON.stringify({ revision: model.revision, files: sizes } satisfies v.InferOutput<typeof installedModelSchema>))
      await writable.close()
    }
    catch (error) {
      await this.removeRevision(model)
      throw error
    }

    // A release can pin a new revision. Reclaim the revisions it supersedes.
    const parent = await this.parentDirectory(model)
    if (!parent)
      return
    const current = encodeURIComponent(model.revision)
    const superseded: string[] = []
    for await (const name of parent.keys()) {
      if (name !== current)
        superseded.push(name)
    }
    for (const name of superseded)
      await parent.removeEntry(name, { recursive: true })
  }

  async open(model: ModelAsset, file: ModelAssetFile): Promise<Response> {
    const directory = await this.modelDirectory(model, false)
    const stored = await (await directory.getFileHandle(file.name)).getFile()
    return new Response(stored)
  }

  /** Removes every stored revision of the model. */
  async remove(model: ModelAsset): Promise<void> {
    const root = await this.rootDirectory()
    try {
      await root.removeEntry(encodeURIComponent(model.id), { recursive: true })
    }
    catch (error) {
      if (!isMissing(error))
        throw error
    }
  }

  private async removeRevision(model: ModelAsset): Promise<void> {
    const parent = await this.parentDirectory(model)
    try {
      await parent?.removeEntry(encodeURIComponent(model.revision), { recursive: true })
    }
    catch (error) {
      if (!isMissing(error))
        throw error
    }
  }

  private async parentDirectory(model: ModelAsset): Promise<FileSystemDirectoryHandle | undefined> {
    const root = await this.rootDirectory()
    try {
      return await root.getDirectoryHandle(encodeURIComponent(model.id))
    }
    catch (error) {
      if (isMissing(error))
        return undefined
      throw error
    }
  }

  private async rootDirectory(): Promise<FileSystemDirectoryHandle> {
    const root = await navigator.storage.getDirectory()
    return root.getDirectoryHandle(DIRECTORY_NAME, { create: true })
  }

  private async modelDirectory(model: ModelAsset, create: boolean): Promise<FileSystemDirectoryHandle> {
    const root = await this.rootDirectory()
    const parent = await root.getDirectoryHandle(encodeURIComponent(model.id), { create })
    return parent.getDirectoryHandle(encodeURIComponent(model.revision), { create })
  }
}

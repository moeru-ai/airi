import type { ModelAsset, ModelAssetFile, ModelAssetProgress, ModelAssetStorage } from '@proj-airi/stage-shared/model-assets'

import { mkdir, open, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { net } from 'electron'

import * as v from 'valibot'

const STAGING_PREFIX = '.download-'

const markerSchema = v.object({
  revision: v.string(),
  files: v.record(v.string(), v.number()),
})

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

/** Stores complete model versions under the Electron user data directory. */
export class FileModelAssetStorage implements ModelAssetStorage {
  constructor(private readonly directory: string, private readonly download: typeof fetch = fetch) {}

  async has(model: ModelAsset): Promise<boolean> {
    const directory = this.modelDirectory(model)
    try {
      const parsed = v.safeParse(markerSchema, JSON.parse(await readFile(join(directory, 'installed.json'), 'utf8')))
      if (!parsed.success || parsed.output.revision !== model.revision)
        return false
      if (Object.keys(parsed.output.files).length !== model.files.length)
        return false
      for (const file of model.files) {
        const size = (await stat(join(directory, file.name))).size
        if (size === 0 || size !== parsed.output.files[file.name])
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
    const parent = join(this.directory, encodeURIComponent(model.id))
    await mkdir(parent, { recursive: true })
    // A killed process leaves its staging directory behind. The repository runs
    // one download per model, so any staging directory here is stale.
    for (const entry of await readdir(parent)) {
      if (entry.startsWith(STAGING_PREFIX))
        await rm(join(parent, entry), { recursive: true, force: true })
    }
    const temporary = join(parent, `${STAGING_PREFIX}${encodeURIComponent(model.revision)}`)
    await mkdir(temporary)
    const sizes: Record<string, number> = {}
    try {
      for (const file of model.files) {
        signal.throwIfAborted()
        const response = await this.download(file.url, { signal })
        if (!response.ok || !response.body)
          throw new Error(`Model asset download failed: ${response.status} ${file.url}`)
        const parsedTotal = Number(response.headers.get('content-length'))
        const total = Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : undefined
        const handle = await open(join(temporary, file.name), 'wx')
        let loaded = 0
        try {
          for await (const chunk of response.body) {
            signal.throwIfAborted()
            let offset = 0
            while (offset < chunk.byteLength) {
              const { bytesWritten } = await handle.write(chunk, offset, chunk.byteLength - offset)
              if (bytesWritten === 0)
                throw new Error(`Model asset write stalled: ${model.id}/${file.name}`)
              offset += bytesWritten
            }
            loaded += chunk.byteLength
            onProgress({ file: file.name, loaded, total })
          }
        }
        finally {
          await handle.close()
        }
        if (loaded === 0 || (total !== undefined && loaded !== total))
          throw new Error(`Incomplete model asset: ${model.id}/${file.name}`)
        sizes[file.name] = loaded
      }

      signal.throwIfAborted()
      await writeFile(join(temporary, 'installed.json'), JSON.stringify({
        revision: model.revision,
        files: sizes,
      } satisfies v.InferOutput<typeof markerSchema>))
      const installed = this.modelDirectory(model)
      await rm(installed, { recursive: true, force: true })
      await rename(temporary, installed)
      // A release can pin a new revision. Reclaim the revisions it supersedes.
      for (const entry of await readdir(parent)) {
        if (entry !== encodeURIComponent(model.revision))
          await rm(join(parent, entry), { recursive: true, force: true })
      }
    }
    finally {
      await rm(temporary, { recursive: true, force: true })
    }
  }

  async open(model: ModelAsset, file: ModelAssetFile): Promise<Response> {
    return net.fetch(pathToFileURL(join(this.modelDirectory(model), file.name)).href)
  }

  /** Removes every stored revision of the model. */
  async remove(model: ModelAsset): Promise<void> {
    await rm(join(this.directory, encodeURIComponent(model.id)), { recursive: true, force: true })
  }

  private modelDirectory(model: ModelAsset): string {
    return join(this.directory, encodeURIComponent(model.id), encodeURIComponent(model.revision))
  }
}

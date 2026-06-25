import type { Live2DFactoryContext, Middleware } from 'pixi-live2d-display/cubism4'

import JSZip from 'jszip'

interface OPFSContext extends Live2DFactoryContext {
  opfsKey?: string
  opfsUrl?: string
  opfsZipBlob?: Blob
}

interface OPFSCacheMeta {
  sourceUrl?: string
  version?: number
}

/**
 * Cache schema version for OPFS-stored Live2D zip directories.
 *
 * Increment when the persisted directory shape changes.
 */
const live2DOpfsCacheVersion = 2

interface IgnoredArchivePathSegmentRule {
  matches: (segment: string) => boolean
}

const ignoredArchivePathSegmentRules: IgnoredArchivePathSegmentRule[] = [
  { matches: segment => segment === '__MACOSX' },
  { matches: segment => segment.startsWith('._') },
]

function shouldIgnoreLive2DArchiveEntry(filePath: string): boolean {
  return filePath
    .split('/')
    .some(segment => ignoredArchivePathSegmentRules.some(rule => rule.matches(segment)))
}

function blobFromBytes(data: Uint8Array): Blob {
  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)
  return new Blob([buffer])
}

declare global {
  interface FileSystemDirectoryHandle {
    values: () => FileSystemDirectoryHandleAsyncIterator<FileSystemHandle>
  }
}

export class OPFSCache {
  static async clearAll(): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory()
      for await (const entry of root.values()) {
        await root.removeEntry(entry.name, { recursive: true })
      }
    }
    catch (e) {
      console.error('[OPFS] Failed to clear cache:', e)
    }
  }

  static async readDirectoryRecursive(dir: FileSystemDirectoryHandle, pathPrefix: string): Promise<File[]> {
    const files: File[] = []
    for await (const entry of dir.values()) {
      if (entry.kind === 'file') {
        const fileHandle = entry as FileSystemFileHandle
        const file = await fileHandle.getFile()
        const relativePath = pathPrefix + file.name
        if (file.name === '__meta.json' || shouldIgnoreLive2DArchiveEntry(relativePath))
          continue
        // live2d-display expects this
        Object.defineProperty(file, 'webkitRelativePath', {
          value: relativePath,
        })
        files.push(file)
      }
      else if (entry.kind === 'directory') {
        const newPrefix = `${pathPrefix + entry.name}/`
        const subFiles = await OPFSCache.readDirectoryRecursive(entry as FileSystemDirectoryHandle, newPrefix)
        files.push(...subFiles)
      }
    }
    return files
  }

  static async resolveDirectory(root: FileSystemDirectoryHandle, path: string): Promise<FileSystemDirectoryHandle> {
    let currentDir = root
    if (!path || path === '.' || path === './')
      return currentDir

    const parts = path.split('/').filter(p => p && p !== '.')
    for (const part of parts) {
      currentDir = await currentDir.getDirectoryHandle(part, { create: true })
    }
    return currentDir
  }

  private static async clearDirectory(dirHandle: FileSystemDirectoryHandle): Promise<void> {
    const entryNames: string[] = []

    // OPFS writes mirror the source zip exactly, so stale files from a previous
    // failed or superseded save must be removed before writing fresh entries.
    for await (const entry of dirHandle.values()) {
      entryNames.push(entry.name)
    }

    await Promise.all(entryNames.map(name => dirHandle.removeEntry(name, { recursive: true })))
  }

  static async writeFile(root: FileSystemDirectoryHandle, filePath: string, content: Blob | string): Promise<void> {
    const parts = filePath.split('/')
    const fileName = parts.pop()!
    const dirPath = parts.join('/')

    const dirHandle = await OPFSCache.resolveDirectory(root, dirPath)
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(content)
    await writable.close()
  }

  static async readMeta(dirHandle: FileSystemDirectoryHandle) {
    try {
      const metaHandle = await dirHandle.getFileHandle('__meta.json', { create: false })
      const metaFile = await metaHandle.getFile()
      const metaText = await metaFile.text()
      return JSON.parse(metaText) as OPFSCacheMeta
    }
    catch {
      return null
    }
  }

  static async get(key: string, sourceUrl: string): Promise<File[] | null> {
    try {
      const root = await navigator.storage.getDirectory()
      const dirHandle = await root.getDirectoryHandle(key, { create: false })
      // eslint-disable-next-line no-console
      console.debug(`[OPFS] Cache hit for ${key}`)

      const meta = await OPFSCache.readMeta(dirHandle)
      if (meta?.version !== live2DOpfsCacheVersion) {
        // NOTICE: Rebuild caches created before OPFS stored the full zip directory.
        // Older caches may contain a reconstructed model3.json instead of the
        // original archive settings file.
        // Source/context: OPFSCache.saveMiddleware settings reconstruction.
        // Removal condition: old OPFS caches no longer need migration support.
        // eslint-disable-next-line no-console
        console.debug(`[OPFS] Cache mismatch for ${key}, schema version changed`)
        await root.removeEntry(dirHandle.name, { recursive: true })
        return null
      }

      const shouldValidateSourceUrl = !sourceUrl.startsWith('blob:')
      if (shouldValidateSourceUrl && meta.sourceUrl && meta.sourceUrl !== sourceUrl) {
        // NOTICE: Skip cache when the requested URL changes while the key stays the same.
        // This avoids serving a stale model when ids are reused or props are out of sync.
        // eslint-disable-next-line no-console
        console.debug(`[OPFS] Cache mismatch for ${key}, source url changed`)
        await root.removeEntry(dirHandle.name, { recursive: true }) // actually invalidates cache
        return null
      }

      const files = await OPFSCache.readDirectoryRecursive(dirHandle, '')

      if (files.length > 0) {
        return files
      }
    }
    catch {
      // Cache Miss
    }
    return null
  }

  /**
   * Persists every non-directory entry from a Live2D zip into OPFS.
   *
   * Use when:
   * - Caching a loaded Live2D zip for later FileLoader replay
   * - Preserving the original model3.json and archive paths exactly
   *
   * Expects:
   * - `zipBlob` is the original archive blob fetched by checkMiddleware
   * - ZIP entry paths are already the physical paths to persist
   *
   * Returns:
   * - A completed OPFS directory write, or logs and returns on cache write failure
   */
  static async save(key: string, zipBlob: Blob, sourceUrl?: string): Promise<void> {
    try {
      const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer())
      const fileEntries = Object.values(zip.files)
        .filter(file => !file.dir && !shouldIgnoreLive2DArchiveEntry(file.name))

      // eslint-disable-next-line no-console
      console.debug(`[OPFS] Saving ${fileEntries.length} zip entries to ${key}`)

      const root = await navigator.storage.getDirectory()
      const dirHandle = await root.getDirectoryHandle(key, { create: true })
      await OPFSCache.clearDirectory(dirHandle)

      const writePromises = fileEntries.map(async (file) => {
        const data = await file.async('uint8array')
        return OPFSCache.writeFile(dirHandle, file.name, blobFromBytes(data))
      })

      await Promise.all(writePromises)
      await OPFSCache.writeFile(dirHandle, '__meta.json', JSON.stringify({
        sourceUrl,
        version: live2DOpfsCacheVersion,
      }))
      // eslint-disable-next-line no-console
      console.debug(`[OPFS] Saved to cache`)
    }
    catch (e) {
      console.error('[OPFS] Failed to save to cache:', e)
    }
  }

  // Runs before ZipLoader to check if the file is already cached
  static checkMiddleware: Middleware<OPFSContext> = async (context, next) => {
    const source = context.source
    let key: string | undefined
    let blobUrl: string | undefined

    // In Model.vue, we pass {id, url} to the loader, extract them here
    if (
      typeof source === 'object'
      && source !== null
      && 'id' in source
      && 'url' in source
    ) {
      key = source.id
      blobUrl = source.url
    }
    else {
      return next()
    }

    // check if url is blob or zip, pass through if not
    if (!key || !blobUrl || (!blobUrl.startsWith('blob:') && !blobUrl.endsWith('.zip'))) {
      context.source = blobUrl
      return next()
    }

    const files = await OPFSCache.get(key, blobUrl)

    if (files) {
      // cache hit
      context.source = files
      return next()
    }

    // cache miss
    // eslint-disable-next-line no-console
    console.debug(`[OPFS] Cache miss for ${key}`)
    context.opfsKey = key
    context.opfsUrl = blobUrl

    try {
      const res = await fetch(blobUrl)
      const blob = await res.blob()
      const fileName = `${key}.zip`
      context.opfsZipBlob = blob
      context.source = [new File([blob], fileName)]
    }
    catch (e) {
      console.error(`[OPFS] Failed to fetch blob for ${key}`, e)
      throw e
    }

    return next()
  }

  // Runs after ZipLoader to cache the files
  static saveMiddleware: Middleware<OPFSContext> = async (context, next) => {
    if (!context.opfsKey || !context.opfsZipBlob) {
      return next()
    }

    await OPFSCache.save(context.opfsKey, context.opfsZipBlob, context.opfsUrl)

    return next()
  }
}

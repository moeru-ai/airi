interface OPFSCacheMeta {
  sourceUrl?: string
  version?: number
}

/**
 * Cache schema version for OPFS-stored MMD source files.
 *
 * Increment when the persisted directory shape changes.
 */
const mmdOpfsCacheVersion = 1
const sourceFileName = '__source.bin'

/**
 * Stores the original MMD source bytes in OPFS so a model can be replayed
 * without fetching its blob URL again after a reload.
 *
 * The cache key must be stable for the same imported model (the display-model
 * id is the intended key). Blob URLs are deliberately not compared because
 * they are recreated for the same IndexedDB-backed file on every session.
 */
export class OPFSCache {
  static async clearAll(): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory()
      const entryNames: string[] = []
      for await (const entry of root.values())
        entryNames.push(entry.name)

      await Promise.all(entryNames.map(name => root.removeEntry(name, { recursive: true })))
    }
    catch (error) {
      console.error('[OPFS] Failed to clear MMD cache:', error)
    }
  }

  private static async writeFile(
    root: FileSystemDirectoryHandle,
    fileName: string,
    content: Blob | string,
  ): Promise<void> {
    const fileHandle = await root.getFileHandle(fileName, { create: true })
    const writable = await fileHandle.createWritable()
    await writable.write(content)
    await writable.close()
  }

  private static async readMeta(dirHandle: FileSystemDirectoryHandle): Promise<OPFSCacheMeta | null> {
    try {
      const metaHandle = await dirHandle.getFileHandle('__meta.json', { create: false })
      const metaFile = await metaHandle.getFile()
      return JSON.parse(await metaFile.text()) as OPFSCacheMeta
    }
    catch {
      return null
    }
  }

  /**
   * Returns the cached source for a model, or `null` when the cache is absent
   * or no longer matches the requested remote URL.
   */
  static async get(key: string, sourceUrl: string): Promise<Blob | null> {
    try {
      const root = await navigator.storage.getDirectory()
      const dirHandle = await root.getDirectoryHandle(key, { create: false })
      const meta = await OPFSCache.readMeta(dirHandle)

      if (meta?.version !== mmdOpfsCacheVersion) {
        // NOTICE:
        // The cache stores one source file plus metadata. Invalidating the
        // directory keeps a future format change from being interpreted as a
        // valid model blob.
        // Source/context: OPFSCache source-file persistence.
        // Removal condition: the persisted directory format is permanently stable.
        await root.removeEntry(dirHandle.name, { recursive: true })
        return null
      }

      const shouldValidateSourceUrl = !sourceUrl.startsWith('blob:')
      if (shouldValidateSourceUrl && meta.sourceUrl && meta.sourceUrl !== sourceUrl) {
        // A stable model id can outlive a changed remote URL. Never serve the
        // old source in that case.
        await root.removeEntry(dirHandle.name, { recursive: true })
        return null
      }

      const sourceHandle = await dirHandle.getFileHandle(sourceFileName, { create: false })
      return await sourceHandle.getFile()
    }
    catch {
      // OPFS is an optional acceleration layer; a miss falls back to fetch.
      return null
    }
  }

  /**
   * Persists the original source bytes under a stable model key.
   * Cache failures are intentionally swallowed so model loading remains usable
   * in browsers where OPFS is unavailable or storage is full.
   */
  static async save(key: string, source: Blob, sourceUrl?: string): Promise<void> {
    try {
      const root = await navigator.storage.getDirectory()
      const dirHandle = await root.getDirectoryHandle(key, { create: true })
      await OPFSCache.writeFile(dirHandle, sourceFileName, source)
      await OPFSCache.writeFile(dirHandle, '__meta.json', JSON.stringify({
        sourceUrl,
        version: mmdOpfsCacheVersion,
      }))
    }
    catch (error) {
      console.error('[OPFS] Failed to save MMD cache:', error)
    }
  }
}

import type { Live2DFactoryContext, Middleware, ModelSettings } from 'pixi-live2d-display/cubism4'

interface OPFSContext extends Live2DFactoryContext {
  opfsKey?: string
  opfsUrl?: string
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
        if (file.name === '__meta.json')
          continue
        // live2d-display expects this
        Object.defineProperty(file, 'webkitRelativePath', {
          value: pathPrefix + file.name,
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
      return JSON.parse(metaText) as { sourceUrl?: string }
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
      if (meta?.sourceUrl && meta.sourceUrl !== sourceUrl) {
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

  static async save(key: string, files: File[], sourceUrl?: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.debug(`[OPFS] Saving ${files.length} files to ${key}`)

    try {
      const root = await navigator.storage.getDirectory()
      const dirHandle = await root.getDirectoryHandle(key, { create: true })

      const writePromises: Promise<void>[] = []

      for (const file of files) {
        const relativePath = file.webkitRelativePath || file.name
        writePromises.push(OPFSCache.writeFile(dirHandle, relativePath, file))
      }

      await Promise.all(writePromises)
      if (sourceUrl) {
        await OPFSCache.writeFile(dirHandle, '__meta.json', JSON.stringify({ sourceUrl }))
      }
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
    if (!context.opfsKey || !Array.isArray(context.source)) {
      return next()
    }

    const files = context.source as File[]

    if (files.length === 0 || !(files[0] instanceof File)) {
      return next()
    }

    const settingsFile = files.find(f => f.name.endsWith('.model.json') || f.name.endsWith('.model3.json'))
    if (!settingsFile) {
      // reconstruct settings files from ModelSettings
      const settings: ModelSettings = (files as any).settings
      if (settings) {
        // eslint-disable-next-line no-console
        console.debug('[OPFS] Reconstructing settings file...')
        const settingsText = encodeModelSettings(settings.json)
        const settingsFilePath = settings.url || 'model.model3.json'
        const settingsFile = new File([settingsText], settingsFilePath)
        Object.defineProperty(settingsFile, 'webkitRelativePath', {
          value: encodeURI(settingsFilePath),
        })
        files.push(settingsFile)
      }
      delete (context.source as any).settings // force the loader to read re-created settings file
    }
    await OPFSCache.save(context.opfsKey, files, context.opfsUrl)

    return next()
  }
}

function encodeProperty(obj: any, path: string) {
  let cursor = obj
  const propPath = path.split('.')
  // will lose reference when access to the last level
  while (propPath.length > 1 && cursor != null && typeof cursor === 'object' && propPath[0] in cursor) {
    cursor = cursor[propPath.shift()!]
  }
  if (cursor == null || cursor[propPath[0]] == null)
    return
  if (typeof cursor[propPath[0]] === 'string')
    cursor[propPath[0]] = encodeURI(cursor[propPath[0]])
  if (Array.isArray(cursor[propPath[0]]) && typeof cursor[propPath[0]][0] === 'string') {
    cursor[propPath[0]] = cursor[propPath[0]].map((s: string) => encodeURI(s))
  }
}
// TODO: find all file paths and encode them by recursively visiting the settings
function encodeModelSettings(input: any): string {
  const settings = JSON.parse(JSON.stringify(input))
  const propertyToEncode = [
    'FileReferences.DisplayInfo',
    'FileReferences.Moc',
    'FileReferences.Textures',
    'FileReferences.Physics',
    'url',
  ]
  propertyToEncode.forEach(k => encodeProperty(settings, k))
  settings?.FileReferences?.Expressions?.map((exp: { Name: string, File: string }) => {
    exp.File = encodeURI(exp.File)
    return exp
  })
  Object.keys(settings?.FileReferences?.Motions ?? {}).forEach((k) => {
    if (!Array.isArray(settings?.FileReferences?.Motions[k]))
      return // not sure whether 'Motions' is of type Record<string,[]>, assume it is for now.
    settings?.FileReferences?.Motions[k].map((exp: { File: string }) => {
      exp.File = encodeURI(exp.File)
      return exp
    })
  })
  return JSON.stringify(settings)
}

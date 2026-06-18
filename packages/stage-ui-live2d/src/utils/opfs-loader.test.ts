import JSZip from 'jszip'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OPFSCache } from './opfs-loader'

class MemoryFileHandle {
  kind = 'file' as const
  private content: Blob = new Blob()

  constructor(public readonly name: string) {}

  async getFile(): Promise<File> {
    return new File([this.content], this.name)
  }

  async createWritable(): Promise<{ write: (content: Blob | string) => Promise<void>, close: () => Promise<void> }> {
    return {
      write: async (content: Blob | string) => {
        this.content = typeof content === 'string'
          ? new Blob([content])
          : content
      },
      close: async () => {},
    }
  }
}

type MemoryHandle = MemoryDirectoryHandle | MemoryFileHandle

class MemoryDirectoryHandle {
  kind = 'directory' as const
  private entries = new Map<string, MemoryHandle>()

  constructor(public readonly name: string) {}

  async getDirectoryHandle(name: string, options: { create?: boolean } = {}): Promise<MemoryDirectoryHandle> {
    const entry = this.entries.get(name)
    if (entry instanceof MemoryDirectoryHandle)
      return entry
    if (entry)
      throw new Error(`File exists at directory path: ${name}`)
    if (!options.create)
      throw new Error(`Directory not found: ${name}`)

    const dir = new MemoryDirectoryHandle(name)
    this.entries.set(name, dir)
    return dir
  }

  async getFileHandle(name: string, options: { create?: boolean } = {}): Promise<MemoryFileHandle> {
    const entry = this.entries.get(name)
    if (entry instanceof MemoryFileHandle)
      return entry
    if (entry)
      throw new Error(`Directory exists at file path: ${name}`)
    if (!options.create)
      throw new Error(`File not found: ${name}`)

    const file = new MemoryFileHandle(name)
    this.entries.set(name, file)
    return file
  }

  async removeEntry(name: string): Promise<void> {
    if (!this.entries.delete(name))
      throw new Error(`Entry not found: ${name}`)
  }

  values(): IterableIterator<MemoryHandle> {
    return this.entries.values()
  }
}

function blobFromBytes(data: Uint8Array): Blob {
  const buffer = new ArrayBuffer(data.byteLength)
  new Uint8Array(buffer).set(data)
  return new Blob([buffer])
}

async function createZip(entries: Record<string, Blob | string | Uint8Array>): Promise<Blob> {
  const zip = new JSZip()

  for (const [path, content] of Object.entries(entries)) {
    zip.file(path, content)
  }

  const data = await zip.generateAsync({ type: 'uint8array' })
  return new Blob([await blobFromBytes(data).arrayBuffer()], { type: 'application/zip' })
}

function installMemoryOPFS(root = new MemoryDirectoryHandle('root')): MemoryDirectoryHandle {
  vi.stubGlobal('navigator', {
    storage: {
      getDirectory: vi.fn(async () => root as unknown as FileSystemDirectoryHandle),
    },
  })
  return root
}

async function writeLegacyCache(root: MemoryDirectoryHandle, key: string): Promise<void> {
  const dir = await root.getDirectoryHandle(key, { create: true })
  await OPFSCache.writeFile(
    dir as unknown as FileSystemDirectoryHandle,
    'model.model3.json',
    JSON.stringify({ Version: 3 }),
  )
}

function filePaths(files: File[]): string[] {
  return files.map(file => file.webkitRelativePath).sort()
}

describe('opfs cache full directory persistence', () => {
  let root: MemoryDirectoryHandle

  beforeEach(() => {
    root = installMemoryOPFS()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saves every zip entry and restores webkitRelativePath from the physical OPFS directory', async () => {
    const zipBlob = await createZip({
      '__MACOSX/._model.model3.json': new Uint8Array([0, 5, 22, 7, 0, 2, 0, 0]),
      '._model.moc3': new Uint8Array([0, 5, 22, 7, 0, 2, 0, 0]),
      'model.model3.json': JSON.stringify({
        Version: 3,
        FileReferences: { Moc: 'model.moc3', Textures: ['textures/texture_00.png'] },
      }),
      'model.moc3': new Uint8Array([77, 79, 67, 51]),
      'textures/texture_00.png': new Uint8Array([1, 2, 3]),
      'extra/readme.txt': 'kept from original archive',
    })

    await OPFSCache.save('live2d-model', zipBlob, 'blob:first')

    const files = await OPFSCache.get('live2d-model', 'blob:second')

    expect(files).not.toBeNull()
    expect(filePaths(files ?? [])).toEqual([
      'extra/readme.txt',
      'model.moc3',
      'model.model3.json',
      'textures/texture_00.png',
    ])
  })

  it('does not restore ignored archive metadata that already exists in OPFS', async () => {
    const dir = await root.getDirectoryHandle('metadata-model', { create: true })
    await OPFSCache.writeFile(
      dir as unknown as FileSystemDirectoryHandle,
      '__MACOSX/._model.model3.json',
      new Blob([new Uint8Array([0, 5, 22, 7, 0, 2, 0, 0])]),
    )
    await OPFSCache.writeFile(
      dir as unknown as FileSystemDirectoryHandle,
      'model.model3.json',
      JSON.stringify({
        Version: 3,
        FileReferences: { Moc: 'model.moc3', Textures: ['texture.png'] },
      }),
    )
    await OPFSCache.writeFile(
      dir as unknown as FileSystemDirectoryHandle,
      '__meta.json',
      JSON.stringify({ sourceUrl: 'blob:first', version: 2 }),
    )

    const files = await OPFSCache.get('metadata-model', 'blob:second')

    expect(files).not.toBeNull()
    expect(filePaths(files ?? [])).toEqual(['model.model3.json'])
  })

  it('keeps the original model3.json text without reconstructing or double-encoding paths', async () => {
    const encodedMoc = encodeURI('八千代辉夜姬.moc3')
    const settingsText = JSON.stringify({
      Version: 3,
      FileReferences: {
        Moc: encodedMoc,
        Textures: ['textures/texture_00.png'],
      },
    })
    const zipBlob = await createZip({
      'model.model3.json': settingsText,
      [encodedMoc]: new Uint8Array([77, 79, 67, 51]),
      'textures/texture_00.png': new Uint8Array([1, 2, 3]),
    })

    await OPFSCache.save('encoded-model', zipBlob, 'blob:first')
    const files = await OPFSCache.get('encoded-model', 'blob:second')
    const settingsFile = files?.find(file => file.webkitRelativePath === 'model.model3.json')

    expect(settingsFile).toBeDefined()
    expect(await settingsFile?.text()).toBe(settingsText)
    expect(await settingsFile?.text()).not.toContain('%25E5')
  })

  it('invalidates caches that were written before the full-directory schema version', async () => {
    await writeLegacyCache(root, 'legacy-model')

    const files = await OPFSCache.get('legacy-model', 'blob:current')

    expect(files).toBeNull()
    await expect(root.getDirectoryHandle('legacy-model', { create: false })).rejects.toThrow('Directory not found')
  })

  it('invalidates non-blob URL cache entries when the source URL changes', async () => {
    const zipBlob = await createZip({
      '__MACOSX/._model.model3.json': new Uint8Array([0, 5, 22, 7, 0, 2, 0, 0]),
      'model.model3.json': JSON.stringify({
        Version: 3,
        FileReferences: { Moc: 'model.moc3', Textures: ['texture.png'] },
      }),
      'model.moc3': new Uint8Array([77, 79, 67, 51]),
      'texture.png': new Uint8Array([1, 2, 3]),
    })

    await OPFSCache.save('remote-model', zipBlob, 'https://example.test/a.zip')
    const files = await OPFSCache.get('remote-model', 'https://example.test/b.zip')

    expect(files).toBeNull()
    await expect(root.getDirectoryHandle('remote-model', { create: false })).rejects.toThrow('Directory not found')
  })

  it('does not invalidate blob URL cache entries when the stable model key matches', async () => {
    const zipBlob = await createZip({
      'model.model3.json': JSON.stringify({
        Version: 3,
        FileReferences: { Moc: 'model.moc3', Textures: ['texture.png'] },
      }),
      'model.moc3': new Uint8Array([77, 79, 67, 51]),
      'texture.png': new Uint8Array([1, 2, 3]),
    })

    await OPFSCache.save('blob-model', zipBlob, 'blob:first')
    const files = await OPFSCache.get('blob-model', 'blob:second')

    expect(files).not.toBeNull()
    expect(filePaths(files ?? [])).toEqual([
      'model.moc3',
      'model.model3.json',
      'texture.png',
    ])
  })

  it('caches the original fetched zip blob from middleware instead of the ZipLoader output list', async () => {
    const zipBlob = await createZip({
      'model.model3.json': JSON.stringify({
        Version: 3,
        FileReferences: { Moc: 'model.moc3', Textures: ['texture.png'] },
      }),
      'model.moc3': new Uint8Array([77, 79, 67, 51]),
      'texture.png': new Uint8Array([1, 2, 3]),
      'not-defined-by-settings.txt': 'still cached',
    })
    vi.stubGlobal('fetch', vi.fn(async () => ({
      blob: async () => zipBlob,
    })))
    const context = {
      source: { id: 'middleware-model', url: 'blob:source' },
    } as Parameters<typeof OPFSCache.checkMiddleware>[0]
    const checkNext = vi.fn(async () => {})

    await OPFSCache.checkMiddleware(context, checkNext)
    context.source = []
    await OPFSCache.saveMiddleware(context, vi.fn(async () => {}))

    const files = await OPFSCache.get('middleware-model', 'blob:next')

    expect(checkNext).toHaveBeenCalledTimes(1)
    expect(files).not.toBeNull()
    expect(filePaths(files ?? [])).toEqual([
      'model.moc3',
      'model.model3.json',
      'not-defined-by-settings.txt',
      'texture.png',
    ])
  })
})

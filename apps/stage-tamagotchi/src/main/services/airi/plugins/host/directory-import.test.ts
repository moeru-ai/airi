import { mkdir, mkdtemp, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ExtensionDirectoryImporter } from './directory-import'

const fileSystemState = vi.hoisted(() => ({
  beforeRead: undefined as undefined | ((path: string) => Promise<void>),
  afterRead: undefined as undefined | ((path: string) => Promise<void>),
  readPaths: [] as string[],
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const fileSystem = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...fileSystem,
    open: async (...args: Parameters<typeof fileSystem.open>) => {
      const path = String(args[0])
      await fileSystemState.beforeRead?.(path)
      const handle = await fileSystem.open(...args)
      const close = handle.close.bind(handle)
      handle.close = async () => {
        await close()
        fileSystemState.readPaths.push(path)
        await fileSystemState.afterRead?.(path)
      }
      return handle
    },
    readFile: async (
      path: Parameters<typeof fileSystem.readFile>[0],
      options?: Parameters<typeof fileSystem.readFile>[1],
    ) => {
      await fileSystemState.beforeRead?.(String(path))
      const contents = await fileSystem.readFile(path)
      fileSystemState.readPaths.push(String(path))
      await fileSystemState.afterRead?.(String(path))
      return typeof options === 'string' ? contents.toString(options) : contents
    },
  }
})

describe('extension directory importer', () => {
  let testRoot: string
  let extensionsRoot: string
  let sourceRoot: string
  let importer: ExtensionDirectoryImporter

  beforeEach(async () => {
    fileSystemState.beforeRead = undefined
    fileSystemState.afterRead = undefined
    fileSystemState.readPaths = []
    testRoot = await mkdtemp(join(tmpdir(), 'airi-extension-import-'))
    extensionsRoot = join(testRoot, 'managed', 'extensions', 'v1')
    sourceRoot = join(testRoot, 'source')
    await writeExtensionPackage(sourceRoot)
    importer = new ExtensionDirectoryImporter(extensionsRoot)
  })

  afterEach(async () => {
    importer.dispose()
    await rm(testRoot, { recursive: true, force: true })
  })

  it('prepares package facts without executing the entrypoint', async () => {
    const markerPath = join(testRoot, 'executed')
    await writeFile(join(sourceRoot, 'extension.mjs'), `await import('node:fs/promises').then(fs => fs.writeFile(${JSON.stringify(markerPath)}, 'yes'))`)

    const plan = await importer.prepare(sourceRoot)

    expect(plan).toMatchObject({
      extensionId: 'example-extension',
      version: '1.0.0',
      runtimes: ['electron'],
      fileCount: 2,
    })
    expect(fileSystemState.readPaths).toHaveLength(1)
    expect(fileSystemState.readPaths[0]).toMatch(/extension\.airi\.json$/)
    await expect(readFile(markerPath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('copies a confirmed package into the managed root and preserves the source', async () => {
    const plan = await importer.prepare(sourceRoot)

    const result = await importer.commit(plan.planId)

    expect(result).toEqual({
      extensionId: 'example-extension',
      manifestPath: join(extensionsRoot, 'example-extension', 'extension.airi.json'),
    })
    expect(await readFile(result.manifestPath, 'utf8')).toContain('example-extension')
    expect(await readFile(join(sourceRoot, 'extension.airi.json'), 'utf8')).toContain('example-extension')
    await expect(importer.commit(plan.planId)).rejects.toThrow('missing or was already used')
  })

  it('rejects invalid manifest fields with their field path', async () => {
    await writeExtensionPackage(sourceRoot, { extraManifestFields: { permisisons: {} } })

    await expect(importer.prepare(sourceRoot)).rejects.toThrow('permisisons')
  })

  it('rejects entrypoints outside the selected folder', async () => {
    await writeExtensionPackage(sourceRoot, { entrypoint: '../outside.mjs' })
    await writeFile(join(testRoot, 'outside.mjs'), 'export default {}')

    await expect(importer.prepare(sourceRoot)).rejects.toThrow('escapes the package folder')
  })

  it('rejects absolute entrypoint paths even when they point inside the source', async () => {
    await writeExtensionPackage(sourceRoot, { entrypoint: join(sourceRoot, 'extension.mjs') })

    await expect(importer.prepare(sourceRoot)).rejects.toThrow('entrypoints must be relative paths')
  })

  it('rejects symbolic links anywhere in the package', async () => {
    await mkdir(join(sourceRoot, 'nested'))
    await symlink(join(sourceRoot, 'extension.mjs'), join(sourceRoot, 'nested', 'linked.mjs'))

    await expect(importer.prepare(sourceRoot)).rejects.toThrow('cannot contain symbolic links')
  })

  it('rejects packages that exceed the import size limit before reading their contents', async () => {
    const oversizedAsset = join(sourceRoot, 'oversized.asset')
    await writeFile(oversizedAsset, '')
    await truncate(oversizedAsset, 512 * 1024 * 1024 + 1)

    // ROOT CAUSE:
    //
    // Inspection retained every file Buffer before showing the review. A
    // large folder could exhaust the Electron main process heap. Inspection
    // now checks package limits before content reads and streams each asset.
    await expect(importer.prepare(sourceRoot)).rejects.toThrow('exceeds the 512 MiB size limit')
  })

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r3986172719
  it('bounds a manifest that grows after the directory walk', async () => {
    fileSystemState.beforeRead = async (path) => {
      if (!path.endsWith(join('source', 'extension.airi.json'))) {
        return
      }
      fileSystemState.beforeRead = undefined
      await truncate(path, 1024 * 1024 + 1)
    }

    // ROOT CAUSE:
    //
    // Inspection checked the manifest size from lstat, then used an unbounded
    // readFile call. A concurrent writer could grow the file before that read
    // and make Electron allocate more than the manifest limit.
    await expect(importer.prepare(sourceRoot)).rejects.toThrow('manifest exceeds the 1 MiB size limit')
  })

  it('rejects a changed source after review', async () => {
    const plan = await importer.prepare(sourceRoot)
    await writeFile(join(sourceRoot, 'extension.mjs'), 'export default { changed: true }')

    await expect(importer.commit(plan.planId)).rejects.toThrow('source changed after review')
  })

  it('enforces package limits when the source grows after commit validation', async () => {
    let manifestReads = 0
    fileSystemState.afterRead = async (path) => {
      if (!path.endsWith(join('source', 'extension.airi.json'))) {
        return
      }
      manifestReads += 1
      if (manifestReads !== 2) {
        return
      }

      const oversizedAsset = join(sourceRoot, 'replacement.asset')
      await writeFile(oversizedAsset, '')
      await truncate(oversizedAsset, 512 * 1024 * 1024 + 1)
    }
    const plan = await importer.prepare(sourceRoot)

    // ROOT CAUSE:
    //
    // Commit validated the source and then delegated the copy to fs.cp. A
    // source change in that interval could add an unbounded file before the
    // staged inspection ran. The copy now counts entries and streamed bytes
    // before they reach the managed staging directory.
    await expect(importer.commit(plan.planId)).rejects.toThrow('exceeds the 512 MiB size limit')
    await expect(readFile(join(extensionsRoot, 'example-extension', 'extension.airi.json')))
      .rejects
      .toMatchObject({ code: 'ENOENT' })
  })

  it('binds the reviewed manifest to the package fingerprint', async () => {
    await writeFile(join(sourceRoot, 'replacement.mjs'), 'export default { id: "replacement-extension", setup() {} }')

    // ROOT CAUSE:
    //
    // Prepare parsed the manifest, then read it again while fingerprinting the
    // package. A replacement between those reads paired the old preview with
    // the new manifest fingerprint, so commit accepted content the user did
    // not review.
    fileSystemState.afterRead = async (path) => {
      if (!path.endsWith(join('source', 'extension.airi.json'))) {
        return
      }
      fileSystemState.afterRead = undefined
      await writeExtensionPackage(sourceRoot, { entrypoint: './replacement.mjs' })
    }

    const plan = await importer.prepare(sourceRoot)

    expect(plan.entrypoints.electron).toBe('./extension.mjs')
    await expect(importer.commit(plan.planId)).rejects.toThrow('source changed after review')
  })

  it('rejects an existing destination before copying', async () => {
    await mkdir(join(extensionsRoot, 'example-extension'), { recursive: true })

    await expect(importer.prepare(sourceRoot)).rejects.toThrow('already installed')
  })

  it('rejects a duplicate id discovered under a different managed folder', async () => {
    importer = new ExtensionDirectoryImporter(extensionsRoot, extensionId => extensionId === 'example-extension')

    await expect(importer.prepare(sourceRoot)).rejects.toThrow('already installed')
  })
})

async function writeExtensionPackage(
  root: string,
  options: { entrypoint?: string, extraManifestFields?: Record<string, unknown> } = {},
) {
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'extension.mjs'), 'export default { id: "example-extension", setup() {} }')
  await writeFile(join(root, 'extension.airi.json'), JSON.stringify({
    manifestVersion: 2,
    kind: 'manifest.extension.airi.moeru.ai',
    id: 'example-extension',
    version: '1.0.0',
    engines: {
      airi: '*',
      runtimes: ['electron'],
    },
    entrypoints: {
      electron: options.entrypoint ?? './extension.mjs',
    },
    permissions: {},
    ...options.extraManifestFields,
  }, null, 2))
}

import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ExtensionDirectoryImporter } from './directory-import'

describe('extension directory importer', () => {
  let testRoot: string
  let extensionsRoot: string
  let sourceRoot: string
  let importer: ExtensionDirectoryImporter

  beforeEach(async () => {
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

  it('rejects a changed source after review', async () => {
    const plan = await importer.prepare(sourceRoot)
    await writeFile(join(sourceRoot, 'extension.mjs'), 'export default { changed: true }')

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

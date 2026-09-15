import type { ExtensionManifestV1 } from '../../../shared/types'

import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { FileSystemLoader } from './fs'

const execFileAsync = promisify(execFile)

function createManifest(entrypoint: string): ExtensionManifestV1 {
  return {
    apiVersion: 'v1',
    kind: 'manifest.extension.airi.moeru.ai',
    id: 'test-loader-plugin',
    permissions: {},
    entrypoints: {
      electron: entrypoint,
    },
  }
}

describe('fileSystemLoader', () => {
  let pluginDir: string

  beforeEach(async () => {
    pluginDir = await mkdtemp(join(tmpdir(), 'airi-plugin-loader-'))
  })

  afterEach(async () => {
    await rm(pluginDir, { recursive: true, force: true })
  })

  it('loads an entrypoint from a resolved absolute filesystem path', async () => {
    await writeFile(
      join(pluginDir, 'index.mjs'),
      'export default { id: "test-loader-plugin", setup() {} }',
    )

    const extension = await new FileSystemLoader()
      .loadExtensionFor(createManifest('./index.mjs'), { cwd: pluginDir })

    expect(extension.id).toBe('test-loader-plugin')
  })

  // ROOT CAUSE:
  //
  // Dynamic `import()` receives the resolved entrypoint as a plain Windows path
  // (`C:\...\index.mjs`), which Node parses as URL scheme `c:` and rejects with
  // ERR_UNSUPPORTED_ESM_URL_SCHEME. Cache-bust queries must also stay URL
  // queries, and a `?` inside a POSIX file name must not split the path.
  //
  // We fixed this by converting the path with `pathToFileURL` first and then
  // appending the cache-bust query to the resulting file URL.
  it('loads an entrypoint with a cache-bust key', async () => {
    await writeFile(
      join(pluginDir, 'index.mjs'),
      'export default { id: "test-loader-plugin", setup() {} }',
    )

    const extension = await new FileSystemLoader()
      .loadExtensionFor(createManifest('./index.mjs'), { cacheBustKey: 'auto-reload-1', cwd: pluginDir })

    expect(extension.id).toBe('test-loader-plugin')
  })

  it('re-imports the entrypoint when the cache-bust key changes', async () => {
    const markerKey = '__airiPluginLoaderEvaluations'
    const readEvaluations = () => (globalThis as unknown as Record<string, number | undefined>)[markerKey]
    await writeFile(
      join(pluginDir, 'index.mjs'),
      [
        `globalThis[${JSON.stringify(markerKey)}] = (globalThis[${JSON.stringify(markerKey)}] ?? 0) + 1`,
        'export default { id: "test-loader-plugin", setup() {} }',
      ].join('\n'),
    )

    try {
      const loader = new FileSystemLoader()
      await loader.loadExtensionFor(createManifest('./index.mjs'), { cacheBustKey: 'reload-1', cwd: pluginDir })
      await loader.loadExtensionFor(createManifest('./index.mjs'), { cacheBustKey: 'reload-2', cwd: pluginDir })

      expect(readEvaluations()).toBe(2)
    }
    finally {
      delete (globalThis as unknown as Record<string, number | undefined>)[markerKey]
    }
  })

  // NOTICE:
  // The Vitest module runner loads dynamic imports itself and does not apply
  // native `module.registerHooks` resolve hooks, so this test reproduces the
  // reload behavior in a child Node process instead.
  it('re-imports relative modules when the cache-bust key changes', async () => {
    const markerKey = '__airiPluginDependencyEvaluations'
    const loaderUrl = pathToFileURL(join(import.meta.dirname, 'fs.ts')).href
    const manifest: ExtensionManifestV1 = {
      apiVersion: 'v1',
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'test-loader-plugin',
      permissions: {},
      entrypoints: { electron: './index.mjs' },
    }

    await writeFile(
      join(pluginDir, 'dependency.mjs'),
      `globalThis[${JSON.stringify(markerKey)}] = (globalThis[${JSON.stringify(markerKey)}] ?? 0) + 1`,
    )
    await writeFile(
      join(pluginDir, 'index.mjs'),
      [
        'import "./dependency.mjs"',
        'export default { id: "test-loader-plugin", setup() {} }',
      ].join('\n'),
    )
    const probePath = join(pluginDir, 'probe.mjs')
    await writeFile(probePath, [
      `import { FileSystemLoader } from ${JSON.stringify(loaderUrl)}`,
      '',
      `const manifest = ${JSON.stringify(manifest)}`,
      'const loader = new FileSystemLoader()',
      `await loader.loadExtensionFor(manifest, { cacheBustKey: 'graph-1', cwd: ${JSON.stringify(pluginDir)} })`,
      `await loader.loadExtensionFor(manifest, { cacheBustKey: 'graph-2', cwd: ${JSON.stringify(pluginDir)} })`,
      `console.log(globalThis[${JSON.stringify(markerKey)}])`,
    ].join('\n'))

    const { stdout } = await execFileAsync(process.execPath, [probePath], { cwd: pluginDir })

    expect(stdout.trim()).toBe('2')
  })

  // NOTICE:
  // CommonJS modules ignore URL queries in the module cache, so the loader must
  // clear their cached entries on a cache-busted load. This test runs in a
  // child Node process for the same reason as the module graph test above.
  it('re-imports CommonJS modules when the cache-bust key changes', async () => {
    const loaderUrl = pathToFileURL(join(import.meta.dirname, 'fs.ts')).href
    const entryManifest: ExtensionManifestV1 = {
      apiVersion: 'v1',
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'test-loader-plugin',
      permissions: {},
      entrypoints: { electron: './entry.cjs' },
    }
    const esmManifest: ExtensionManifestV1 = {
      ...entryManifest,
      entrypoints: { electron: './index.mjs' },
    }

    await writeFile(join(pluginDir, 'entry.cjs'), [
      'globalThis.__airiCjsEntryEvaluations = (globalThis.__airiCjsEntryEvaluations ?? 0) + 1',
      'module.exports = { id: "test-loader-plugin", setup() {} }',
    ].join('\n'))
    await writeFile(
      join(pluginDir, 'helper.cjs'),
      'globalThis.__airiCjsHelperEvaluations = (globalThis.__airiCjsHelperEvaluations ?? 0) + 1',
    )
    await writeFile(join(pluginDir, 'index.mjs'), [
      'import "./helper.cjs"',
      'export default { id: "test-loader-plugin", setup() {} }',
    ].join('\n'))

    const probePath = join(pluginDir, 'probe-cjs.mjs')
    await writeFile(probePath, [
      `import { FileSystemLoader } from ${JSON.stringify(loaderUrl)}`,
      '',
      `const entryManifest = ${JSON.stringify(entryManifest)}`,
      `const esmManifest = ${JSON.stringify(esmManifest)}`,
      'const loader = new FileSystemLoader()',
      `await loader.loadExtensionFor(entryManifest, { cacheBustKey: 'cjs-1', cwd: ${JSON.stringify(pluginDir)} })`,
      `await loader.loadExtensionFor(entryManifest, { cacheBustKey: 'cjs-2', cwd: ${JSON.stringify(pluginDir)} })`,
      `await loader.loadExtensionFor(esmManifest, { cacheBustKey: 'esm-1', cwd: ${JSON.stringify(pluginDir)} })`,
      `await loader.loadExtensionFor(esmManifest, { cacheBustKey: 'esm-2', cwd: ${JSON.stringify(pluginDir)} })`,
      'console.log(globalThis.__airiCjsEntryEvaluations + "," + globalThis.__airiCjsHelperEvaluations)',
    ].join('\n'))

    const { stdout } = await execFileAsync(process.execPath, [probePath], { cwd: pluginDir })

    expect(stdout.trim()).toBe('2,2')
  })

  // NOTICE:
  // Windows creates directory links as junctions, because plain symlinks need
  // extra privileges there.
  it('re-imports dependencies behind a symlinked plugin root', async () => {
    const realRoot = join(pluginDir, 'real-plugin')
    const linkedRoot = join(pluginDir, 'linked-plugin')
    await mkdir(realRoot, { recursive: true })
    await writeFile(
      join(realRoot, 'dependency.mjs'),
      'globalThis.__airiLinkedDependencyEvaluations = (globalThis.__airiLinkedDependencyEvaluations ?? 0) + 1',
    )
    await writeFile(join(realRoot, 'index.mjs'), [
      'import "./dependency.mjs"',
      'export default { id: "test-loader-plugin", setup() {} }',
    ].join('\n'))
    await symlink(realRoot, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir')

    const loaderUrl = pathToFileURL(join(import.meta.dirname, 'fs.ts')).href
    const manifest: ExtensionManifestV1 = {
      apiVersion: 'v1',
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'test-loader-plugin',
      permissions: {},
      entrypoints: { electron: './index.mjs' },
    }
    const probePath = join(pluginDir, 'probe-linked.mjs')
    await writeFile(probePath, [
      `import { FileSystemLoader } from ${JSON.stringify(loaderUrl)}`,
      '',
      `const manifest = ${JSON.stringify(manifest)}`,
      'const loader = new FileSystemLoader()',
      `await loader.loadExtensionFor(manifest, { cacheBustKey: 'linked-1', cwd: ${JSON.stringify(linkedRoot)} })`,
      `await loader.loadExtensionFor(manifest, { cacheBustKey: 'linked-2', cwd: ${JSON.stringify(linkedRoot)} })`,
      'console.log(globalThis.__airiLinkedDependencyEvaluations)',
    ].join('\n'))

    const { stdout } = await execFileAsync(process.execPath, [probePath], { cwd: pluginDir })

    expect(stdout.trim()).toBe('2')
  })
})

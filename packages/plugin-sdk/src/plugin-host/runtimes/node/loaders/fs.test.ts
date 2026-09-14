import type { ExtensionManifestV1 } from '../../../shared/types'

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { FileSystemLoader } from './fs'

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
})

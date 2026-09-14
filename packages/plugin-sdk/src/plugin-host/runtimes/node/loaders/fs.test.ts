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
  // ERR_UNSUPPORTED_ESM_URL_SCHEME. Cache-bust queries from plugin auto-reload
  // also must survive the path-to-URL conversion.
  //
  // We fixed this by converting resolved paths with `pathToFileURL` while keeping
  // the query string appended as a URL query.
  it('loads an entrypoint with an auto-reload cache-bust query', async () => {
    await writeFile(
      join(pluginDir, 'index.mjs'),
      'export default { id: "test-loader-plugin", setup() {} }',
    )

    const extension = await new FileSystemLoader()
      .loadExtensionFor(createManifest('./index.mjs?cacheBust=auto-reload-1'), { cwd: pluginDir })

    expect(extension.id).toBe('test-loader-plugin')
  })
})

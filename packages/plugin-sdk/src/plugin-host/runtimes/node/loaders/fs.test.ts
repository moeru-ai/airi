import type { ExtensionManifestV2 } from '../../../shared/types'

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { FileSystemLoader, toEntrypointImportUrl } from './fs'

const created: string[] = []

function workdir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'fs-loader-'))
  created.push(dir)
  return dir
}

function writeExtension(dir: string, source = 'export default { id: \'test-extension\', setup() {} }'): string {
  const file = join(dir, 'extension.mjs')
  writeFileSync(file, source, 'utf8')
  return file
}

function manifestFor(entrypoints: ExtensionManifestV2['entrypoints']): ExtensionManifestV2 {
  return {
    manifestVersion: 2,
    kind: 'manifest.extension.airi.moeru.ai',
    id: 'test-extension',
    version: '0.0.1',
    engines: { airi: '*', runtimes: ['electron'] },
    permissions: {},
    entrypoints,
  }
}

/**
 * Runs `loadExtensionFor` in a real Node process.
 *
 * Vitest rewrites `import()` into its own resolver, which accepts Windows paths,
 * so a plain unit test passes even where the shipped loader breaks.
 */
function loadThroughNodeEsm(extensionPath: string): { ok: boolean, output: string } {
  const dir = workdir()
  const probe = join(dir, 'probe.mjs')
  const loaderUrl = new URL('./fs.ts', import.meta.url).href
  const manifest = manifestFor({ electron: 'PLACEHOLDER' })
  writeFileSync(probe, [
    `const { FileSystemLoader } = await import(${JSON.stringify(loaderUrl)})`,
    `const manifest = ${JSON.stringify(manifest)}`,
    'manifest.entrypoints.electron = process.argv[2]',
    'try {',
    '  const extension = await new FileSystemLoader().loadExtensionFor(manifest)',
    '  console.log(\'LOAD_OK\', extension.id)',
    '} catch (error) {',
    '  console.log(\'LOAD_FAIL\', error.code || error.name, error.message.slice(0, 120))',
    '}',
  ].join('\n'), 'utf8')

  // Node strips TypeScript types natively, so the probe needs no extra loader.
  const output = execFileSync(
    process.execPath,
    [probe, extensionPath],
    { encoding: 'utf8', cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
  )
  return { ok: output.includes('LOAD_OK'), output: output.trim() }
}

afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('fileSystemLoader', () => {
  // https://github.com/moeru-ai/airi/issues/3359
  //
  // ROOT CAUSE:
  //
  // On Windows the entrypoint is an absolute path. `import()` reads the drive
  // letter as a URL scheme and rejects it.
  //
  // Before: await import(entrypoint)
  // After:  await import(toEntrypointImportUrl(entrypoint))
  it('converts an entrypoint path to a file URL (Issue #3359)', () => {
    const entrypoint = resolve(tmpdir(), 'airi-extension.mjs')

    const url = new URL(toEntrypointImportUrl(entrypoint))

    expect(url.protocol).toBe('file:')
    expect(url.pathname.endsWith('/airi-extension.mjs')).toBe(true)
  })

  // https://github.com/moeru-ai/airi/issues/3359
  //
  // ROOT CAUSE:
  //
  // The plugin host reloads an extension with a cache-bust query on the
  // entrypoint. Converting the whole string as a path encodes `?` as `%3F`.
  it('keeps a cache-bust query as a URL query (Issue #3359)', () => {
    const entrypoint = `${resolve(tmpdir(), 'airi-extension.mjs')}?cacheBust=42`

    const url = new URL(toEntrypointImportUrl(entrypoint))

    expect(url.search).toBe('?cacheBust=42')
    expect(url.pathname.endsWith('/airi-extension.mjs')).toBe(true)
  })

  // https://github.com/moeru-ai/airi/issues/3359
  //
  // ROOT CAUSE:
  //
  // Vitest rewrites `import()` into its own resolver, so a unit test passes where
  // the shipped loader fails. Real Node is required to reproduce the rejection.
  it('imports an absolute entrypoint in real Node (Issue #3359)', () => {
    const file = writeExtension(workdir())

    const result = loadThroughNodeEsm(file)

    expect(result.output, 'expected the extension to load under Node ESM').toMatch(/LOAD_OK test-extension/)
    expect(result.ok).toBe(true)
  })

  it('resolves absolute and relative entrypoints before importing', () => {
    const loader = new FileSystemLoader()
    const absolutePath = resolve(tmpdir(), 'extension.mjs')

    expect(loader.resolveEntrypointFor(manifestFor({ electron: absolutePath }))).toBe(absolutePath)
    expect(loader.resolveEntrypointFor(manifestFor({ default: 'extension.mjs' }), { cwd: tmpdir() }))
      .toBe(join(tmpdir(), 'extension.mjs'))
  })

  it('reads a relative entrypoint against the provided root', async () => {
    const dir = workdir()
    const file = writeExtension(dir)
    const loader = new FileSystemLoader()

    const extension = await loader.loadExtensionFor(manifestFor({ default: 'extension.mjs' }), { cwd: dir })

    expect(extension.id).toBe('test-extension')
    expect(file).toContain(dir)
  })

  it('rejects a module that is not an extension', async () => {
    const file = writeExtension(workdir(), 'export default { id: \'test-extension\' }')
    const loader = new FileSystemLoader()

    await expect(loader.loadExtensionFor(manifestFor({ electron: file })))
      .rejects
      .toThrow(/Failed to resolve extension module/)
  })
})

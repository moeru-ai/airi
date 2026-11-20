import { execFile } from 'node:child_process'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execPath, platform } from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import { beforeEach, describe, expect, it, onTestFinished } from 'vitest'

const execFileAsync = promisify(execFile)
/** Native probes resolve the built public exports from the SDK workspace. */
const sdkRoot = resolve(import.meta.dirname, '../../../../..')

describe('filesystem entrypoints through native Node ESM', () => {
  let root: string

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'airi-entrypoint-')))
    onTestFinished(() => rm(root, { recursive: true, force: true }))
  })

  async function probe(source: string) {
    // A separate Node process imports the built public SDK without Vitest import transforms.
    const { stdout } = await execFileAsync(execPath, ['--input-type=module', '--eval', `
      import { FileSystemLoader, ExtensionHost } from '@proj-airi/plugin-sdk/plugin-host'
      import { writeFile } from 'node:fs/promises'
      import { join } from 'node:path'
      import { pathToFileURL } from 'node:url'
      const root = ${JSON.stringify(root)}
      const loader = new FileSystemLoader()
      const manifest = {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: 'example-extension',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['node'] },
        permissions: {},
        entrypoints: {},
      }
      const entrySource = revision =>
        'export default { id: "example-extension", setup() { return { revision: '
        + JSON.stringify(revision) + ', url: import.meta.url } } }'
      ${source}
    `], { cwd: sdkRoot })
    return JSON.parse(stdout) as unknown
  }

  // https://github.com/moeru-ai/airi/issues/3359
  // ROOT CAUSE:
  //
  // Raw paths treat Windows drive letters as schemes and filename characters as URL syntax.
  // We fixed this by converting filesystem paths with pathToFileURL before native import().
  it('imports absolute and relative filesystem paths without URL interpretation (Issue #3359)', async () => {
    const results = await probe(`
      const results = []
      for (const name of ['entry.mjs', 'space 中文 # % %23.mjs']) {
        const path = join(root, name)
        await writeFile(path, entrySource(name))
        for (const entrypoint of [path, name]) {
          manifest.entrypoints = { node: entrypoint, default: 'missing.mjs' }
          const extension = await loader.loadExtensionFor(manifest, { cwd: root, runtime: 'node' })
          const result = extension.setup()
          results.push({ revision: result.revision, url: result.url })
        }
      }
      console.log(JSON.stringify(results))
    `)
    expect(results).toEqual(['entry.mjs', 'space 中文 # % %23.mjs'].flatMap(name => [
      { revision: name, url: pathToFileURL(join(root, name)).href },
      { revision: name, url: pathToFileURL(join(root, name)).href },
    ]))
  })

  it.skipIf(platform === 'win32')('preserves POSIX question marks in filenames', async () => {
    expect(await probe(`
      const name = 'literal?query # %23.mjs'
      await writeFile(join(root, name), entrySource('question'))
      manifest.entrypoints = { default: name }
      const extension = await loader.loadExtensionFor(manifest, { cwd: root, runtime: 'node', cacheBustKey: '? & # % 中文' })
      console.log(JSON.stringify(extension.setup()))
    `)).toEqual({
      revision: 'question',
      url: `${pathToFileURL(join(root, 'literal?query # %23.mjs')).href}?${new URLSearchParams({ cacheBust: '? & # % 中文' })}`,
    })
  })

  it('separates entry-module cache identity from the unchanged manifest', async () => {
    expect(await probe(`
      const path = join(root, 'cache.mjs')
      manifest.entrypoints = { default: path }
      const original = JSON.stringify(manifest)
      const load = async cacheBustKey => {
        const extension = await loader.loadExtensionFor(manifest, { runtime: 'node', cacheBustKey })
        return extension.setup()
      }
      const key = 'A ? & # % + 中文'
      await writeFile(path, entrySource('A'))
      const first = await load(key)
      await writeFile(path, entrySource('B'))
      const same = await load(key)
      const fresh = await load('B')
      const empty = await load('')
      const omitted = await load(undefined)
      console.log(JSON.stringify({ first, same, fresh, empty, omitted, unchanged: original === JSON.stringify(manifest) }))
    `)).toEqual({
      first: { revision: 'A', url: `${pathToFileURL(join(root, 'cache.mjs')).href}?${new URLSearchParams({ cacheBust: 'A ? & # % + 中文' })}` },
      same: { revision: 'A', url: `${pathToFileURL(join(root, 'cache.mjs')).href}?${new URLSearchParams({ cacheBust: 'A ? & # % + 中文' })}` },
      fresh: { revision: 'B', url: `${pathToFileURL(join(root, 'cache.mjs')).href}?cacheBust=B` },
      empty: { revision: 'B', url: `${pathToFileURL(join(root, 'cache.mjs')).href}?cacheBust=` },
      omitted: { revision: 'B', url: pathToFileURL(join(root, 'cache.mjs')).href },
      unchanged: true,
    })
  })

  it('passes start and reload options without retaining cache keys in sessions', async () => {
    expect(await probe(`
      const path = join(root, 'host.mjs')
      manifest.entrypoints = { node: 'host.mjs', default: 'missing.mjs' }
      const original = JSON.stringify(manifest)
      const host = new ExtensionHost({ runtime: 'electron' })
      const source = revision => 'export default { id: "example-extension", async setup(ctx) { await ctx.modules.register({ id: '
        + JSON.stringify(revision) + ' }) } }'
      await writeFile(path, source('A'))
      let session = await host.start(manifest, { cwd: root, runtime: 'node', cacheBustKey: 'A' })
      const results = [host.listModules().map(module => module.id)]
      await writeFile(path, source('B'))
      session = await host.reload(session.id, { cacheBustKey: 'A' })
      results.push(host.listModules().map(module => module.id))
      session = await host.reload(session.id)
      results.push(host.listModules().map(module => module.id))
      await writeFile(path, source('C'))
      session = await host.reload(session.id)
      results.push(host.listModules().map(module => module.id))
      session = await host.reload(session.id, { cacheBustKey: '' })
      results.push(host.listModules().map(module => module.id))
      const sessionManifestUnchanged = JSON.stringify(session.manifest) === original
      await host.stop(session.id)
      console.log(JSON.stringify({ results, sessionManifestUnchanged, manifestUnchanged: JSON.stringify(manifest) === original, sessions: host.listSessions() }))
    `)).toEqual({
      results: [['A'], ['A'], ['B'], ['B'], ['C']],
      sessionManifestUnchanged: true,
      manifestUnchanged: true,
      sessions: [],
    })
  })

  it('rejects invalid exports and failed imports without successful sessions', async () => {
    expect(await probe(`
      const path = join(root, 'invalid.mjs')
      await writeFile(path, 'export default { id: "example-extension" }')
      const host = new ExtensionHost({ runtime: 'node' })
      const errors = []
      for (const entrypoint of [path, join(root, 'missing.mjs')]) {
        manifest.entrypoints = { node: entrypoint }
        try { await host.start(manifest) } catch (error) { errors.push(error.message) }
      }
      console.log(JSON.stringify({ errors, sessions: host.listSessions() }))
    `)).toEqual({
      errors: [
        'Failed to resolve extension module. The entrypoint must export defineExtension(...).',
        expect.stringContaining('Cannot find module'),
      ],
      sessions: [],
    })
  })

  // https://github.com/moeru-ai/airi/issues/3359
  // ROOT CAUSE:
  //
  // Native Node rejects raw Windows drive paths. The loader now imports a file URL.
  it.runIf(platform === 'win32')('rejects raw Windows paths but loads them through the SDK (Issue #3359)', async () => {
    expect(await probe(`
      const path = join(root, 'windows-entry.mjs')
      await writeFile(path, entrySource('windows'))
      let rawError
      try { await import(path) } catch (error) { rawError = error.code }
      manifest.entrypoints = { node: path }
      const extension = await loader.loadExtensionFor(manifest, { runtime: 'node' })
      console.log(JSON.stringify({ rawError, revision: extension.setup().revision }))
    `)).toEqual({ rawError: 'ERR_UNSUPPORTED_ESM_URL_SCHEME', revision: 'windows' })
  })
})

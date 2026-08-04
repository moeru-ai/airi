import type { Server } from 'node:http'

import type { ConfigPluginContext, Plugin } from 'vite'

import type { Cubism2CoreOptions } from './cubism2-core'

import process from 'node:process'

import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { Cubism2Core } from './cubism2-core'

/**
 * The `.cubism2` drop-in is real filesystem state these tests cannot own: a
 * developer who places `packages/stage-ui-live2d/.cubism2/live2d.min.js` there
 * has legitimately enabled Cubism 2, which is the opposite of what the
 * "no core resolved" and "falls through to the download" cases assert. Those
 * cases are skipped instead of silently inverting. Path segments mirror the
 * plugin's own resolution, and this file lives in the same directory, so both
 * walk `src/vite` up to the package root.
 */
const dropInCoreExists = existsSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '.cubism2', 'live2d.min.js'))

const environmentKeys = [
  'AIRI_CUBISM2_CORE_PATH',
  'AIRI_CUBISM2_CORE_SHA256',
  'AIRI_CUBISM2_CORE_URL',
  'AIRI_CUBISM2_CORE_URL_SHA256',
] as const

const savedEnvironment: Partial<Record<(typeof environmentKeys)[number], string>> = {}

/**
 * Sets the plugin's environment aside for the duration of one case.
 *
 * A developer machine or CI runner may already provision a core; every case
 * below states its own configuration, so the ambient one must not leak in.
 */
function takeEnvironment() {
  for (const key of environmentKeys) {
    const value = process.env[key]
    if (value !== undefined)
      savedEnvironment[key] = value

    delete process.env[key]
  }
}

function restoreEnvironment() {
  for (const key of environmentKeys) {
    const value = savedEnvironment[key]
    if (value === undefined)
      delete process.env[key]
    else
      process.env[key] = value

    delete savedEnvironment[key]
  }
}

/** Warnings raised by the run under assertion, reset before each case. */
let recordedWarnings: string[] = []

/**
 * Stands in for the `BasicMinimalPluginContext` Vite binds to `config()`.
 *
 * Warnings are recorded rather than logged: several cases assert that a
 * degraded path explains itself, and one asserts the absence of the "unpinned
 * core" warning.
 */
const pluginContext: ConfigPluginContext = {
  meta: { rollupVersion: '4.0.0', rolldownVersion: '1.0.0', viteVersion: '8.0.0' },
  debug: () => {},
  info: () => {},
  warn: (warning) => {
    recordedWarnings.push(typeof warning === 'string' ? warning : String(warning))
  },
  error: (error) => {
    throw typeof error === 'string' ? new Error(error) : error
  },
}

/** Invokes the plugin's `config()` hook and returns its partial config. */
async function runConfigHook(plugin: Plugin) {
  const hook = plugin.config
  if (typeof hook !== 'function')
    throw new TypeError('Cubism2Core must expose `config` as a plain function hook.')

  return await hook.call(pluginContext, {}, { command: 'build', mode: 'production' })
}

describe('cubism2 core vite plugin', () => {
  let fixtureDirectory: string
  let cacheDirectory: string

  /**
   * Writes a real core stand-in and returns its digest.
   *
   * The plugin reads and hashes from disk, so the fixture has to be an actual
   * file; `node:fs` is deliberately never mocked.
   */
  function writeCoreFixture(name: string, contents: string) {
    const path = join(fixtureDirectory, name)
    writeFileSync(path, contents)

    return { path, sha256: createHash('sha256').update(contents).digest('hex') }
  }

  /**
   * Builds the plugin with the network and the shared cache pointed somewhere
   * inert, so a case in this suite never reaches either one.
   *
   * Without this, every "no core resolved" case would fetch the real mirror and
   * could pick up a core cached by an ordinary `pnpm dev` on the same checkout.
   */
  function createPlugin(options: Cubism2CoreOptions = {}) {
    return Cubism2Core({ downloadUrl: false, cacheDir: cacheDirectory, ...options })
  }

  beforeAll(() => {
    fixtureDirectory = mkdtempSync(join(tmpdir(), 'airi-cubism2-'))
  })

  beforeEach(() => {
    recordedWarnings = []
    cacheDirectory = mkdtempSync(join(fixtureDirectory, 'cache-'))
    takeEnvironment()
  })

  afterEach(() => {
    restoreEnvironment()
  })

  afterAll(() => {
    rmSync(fixtureDirectory, { recursive: true, force: true })
  })

  it.skipIf(dropInCoreExists)('keeps Cubism 3+ only builds untouched when nothing is configured', async () => {
    expect(await runConfigHook(createPlugin())).toEqual({ define: { __AIRI_CUBISM2_CORE_PATH__: 'null' } })
  })

  it.skipIf(dropInCoreExists)('treats a configured path that is not on disk as no core at all', async () => {
    const missingPath = join(fixtureDirectory, 'not-provisioned.js')

    expect(await runConfigHook(createPlugin({ sourcePath: missingPath }))).toEqual({ define: { __AIRI_CUBISM2_CORE_PATH__: 'null' } })
  })

  it('points the define at the served core when the checksum matches', async () => {
    const core = writeCoreFixture('verified.js', 'window.Live2D = { verified: true }')

    expect(await runConfigHook(createPlugin({ sourcePath: core.path, sha256: core.sha256 })))
      .toEqual({ define: { __AIRI_CUBISM2_CORE_PATH__: '"assets/js/live2d.min.js"' } })
  })

  // https://github.com/moeru-ai/airi/pull/2201
  it('reports the core path relative to the app base, never root-anchored', async () => {
    // ROOT CAUSE:
    //
    // The define carried a root-anchored `/assets/js/live2d.min.js`, which the
    // consumer assigned straight to `script.src`.
    //
    // Packaged stage-tamagotchi builds its renderer with `base: './'` and loads
    // it over `file://`, so that path resolved against the filesystem root
    // instead of the renderer directory the asset was emitted into. The same
    // path written in `index.html` was fine, because Vite rewrites asset
    // references it can see in HTML and cannot rewrite a define string.
    //
    // The blast radius was every Live2D model, not just Cubism 2 ones: a
    // non-null define makes `loadLive2DRuntime` take the combined-bundle branch,
    // whose rejection is cached for the process lifetime.
    //
    // We fixed this by emitting a base-relative path that the consumer joins to
    // `import.meta.env.BASE_URL` — `./` in the packaged renderer, `/` in dev and
    // in the web and pocket apps.
    const core = writeCoreFixture('base-relative.js', 'window.Live2D = { base: "relative" }')

    const config = await runConfigHook(createPlugin({ sourcePath: core.path, sha256: core.sha256 }))

    const definedPath: unknown = config?.define?.__AIRI_CUBISM2_CORE_PATH__
    expect(typeof definedPath).toBe('string')
    expect(JSON.parse(definedPath as string)).toBe('assets/js/live2d.min.js')
    expect(JSON.parse(definedPath as string).startsWith('/')).toBe(false)
  })

  it('serves an unpinned core so the local drop-in needs no setup', async () => {
    const core = writeCoreFixture('unpinned.js', 'window.Live2D = { pinned: false }')

    expect(await runConfigHook(createPlugin({ sourcePath: core.path })))
      .toEqual({ define: { __AIRI_CUBISM2_CORE_PATH__: '"assets/js/live2d.min.js"' } })
    expect(recordedWarnings.some(warning => warning.includes('without a checksum'))).toBe(true)
  })

  it('throws when the resolved core does not match the configured checksum', async () => {
    const core = writeCoreFixture('tampered.js', 'window.Live2D = { tampered: true }')
    const wrongSha256 = createHash('sha256').update('a different core').digest('hex')

    await expect(runConfigHook(createPlugin({ sourcePath: core.path, sha256: wrongSha256 })))
      .rejects
      .toThrow(/Cubism 2 core checksum mismatch for/)
  })

  it.skipIf(dropInCoreExists)('throws when a checksum is pinned but no core resolves', async () => {
    const missingPath = join(fixtureDirectory, 'never-written.js')
    const orphanSha256 = createHash('sha256').update('nothing to verify').digest('hex')

    await expect(runConfigHook(createPlugin({ sourcePath: missingPath, sha256: orphanSha256 })))
      .rejects
      .toThrow(/checksum is configured but no core file was found/)
  })

  it('reads the core from the environment when no options are passed', async () => {
    const core = writeCoreFixture('from-environment.js', 'window.Live2D = { origin: "environment" }')
    process.env.AIRI_CUBISM2_CORE_PATH = core.path
    process.env.AIRI_CUBISM2_CORE_SHA256 = core.sha256

    expect(await runConfigHook(createPlugin())).toEqual({ define: { __AIRI_CUBISM2_CORE_PATH__: '"assets/js/live2d.min.js"' } })
  })

  it('prefers options.sourcePath over AIRI_CUBISM2_CORE_PATH', async () => {
    const preferred = writeCoreFixture('preferred.js', 'window.Live2D = { origin: "options" }')
    const shadowed = writeCoreFixture('shadowed.js', 'window.Live2D = { origin: "environment" }')
    process.env.AIRI_CUBISM2_CORE_PATH = shadowed.path

    // The digest is the observable: it only matches if the option's file was the
    // one read, so a reversed precedence fails here as a checksum mismatch.
    expect(await runConfigHook(createPlugin({ sourcePath: preferred.path, sha256: preferred.sha256 })))
      .toEqual({ define: { __AIRI_CUBISM2_CORE_PATH__: '"assets/js/live2d.min.js"' } })
  })
})

/**
 * The download runs against a loopback HTTP server rather than the real mirror,
 * so the suite stays offline-safe and can assert how many requests a build
 * actually makes. `fetch`, `node:fs`, and `node:http` are all real here.
 */
describe('cubism2 core download', () => {
  const coreBody = 'window.Live2D = { origin: "mirror" }'
  const coreSha256 = createHash('sha256').update(coreBody).digest('hex')

  let fixtureDirectory: string
  let cacheDirectory: string
  let server: Server
  let origin: string
  let requestedPaths: string[] = []

  /** Path of the one file the plugin caches, under the current case's cache directory. */
  function cachedCorePath() {
    return join(cacheDirectory, 'live2d.min.js')
  }

  beforeAll(async () => {
    fixtureDirectory = mkdtempSync(join(tmpdir(), 'airi-cubism2-download-'))

    server = createServer((request, response) => {
      requestedPaths.push(request.url ?? '')

      if (request.url === '/core.js') {
        response.writeHead(200, { 'Content-Type': 'text/javascript' })
        response.end(coreBody)
        return
      }

      // Stands in for a mirror that started serving different bytes than the
      // pin describes, which the plugin must refuse rather than cache.
      if (request.url === '/substituted.js') {
        response.writeHead(200, { 'Content-Type': 'text/javascript' })
        response.end('window.Live2D = { origin: "not the pinned bytes" }')
        return
      }

      response.writeHead(404)
      response.end()
    })

    // Port 0 lets the OS pick a free port, so parallel Vitest workers on the
    // same machine cannot collide on a hardcoded one.
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))

    const address = server.address()
    if (address === null || typeof address === 'string')
      throw new TypeError('The fixture server did not bind to a TCP port.')

    origin = `http://127.0.0.1:${address.port}`
  })

  beforeEach(() => {
    recordedWarnings = []
    requestedPaths = []

    // Each case owns its cache directory: these cases assert on the presence of
    // the cached file, and a shared directory would let one case satisfy
    // another's cache-miss precondition.
    cacheDirectory = mkdtempSync(join(fixtureDirectory, 'cache-'))
    takeEnvironment()
  })

  afterEach(() => {
    restoreEnvironment()
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    rmSync(fixtureDirectory, { recursive: true, force: true })
  })

  it.skipIf(dropInCoreExists)('fetches and caches the core when no local copy resolves', async () => {
    const plugin = Cubism2Core({ downloadUrl: `${origin}/core.js`, downloadSha256: coreSha256, cacheDir: cacheDirectory })

    expect(await runConfigHook(plugin)).toEqual({ define: { __AIRI_CUBISM2_CORE_PATH__: '"assets/js/live2d.min.js"' } })
    expect(requestedPaths).toEqual(['/core.js'])
    expect(readFileSync(cachedCorePath(), 'utf8')).toBe(coreBody)
  })

  it.skipIf(dropInCoreExists)('does not warn about an unpinned core, because the download verifies its own pin', async () => {
    const plugin = Cubism2Core({ downloadUrl: `${origin}/core.js`, downloadSha256: coreSha256, cacheDir: cacheDirectory })

    await runConfigHook(plugin)

    expect(recordedWarnings).toEqual([])
  })

  it.skipIf(dropInCoreExists)('reuses the cached core instead of downloading it again', async () => {
    const options = { downloadUrl: `${origin}/core.js`, downloadSha256: coreSha256, cacheDir: cacheDirectory }

    await runConfigHook(Cubism2Core(options))

    expect(await runConfigHook(Cubism2Core(options))).toEqual({ define: { __AIRI_CUBISM2_CORE_PATH__: '"assets/js/live2d.min.js"' } })
    // The second build is a separate plugin instance, so a cache that only
    // lived in memory would show a second request here.
    expect(requestedPaths).toEqual(['/core.js'])
  })

  it.skipIf(dropInCoreExists)('re-downloads when the cached bytes no longer match the pin', async () => {
    writeFileSync(cachedCorePath(), 'a truncated write left by an interrupted build')

    const plugin = Cubism2Core({ downloadUrl: `${origin}/core.js`, downloadSha256: coreSha256, cacheDir: cacheDirectory })

    expect(await runConfigHook(plugin)).toEqual({ define: { __AIRI_CUBISM2_CORE_PATH__: '"assets/js/live2d.min.js"' } })
    expect(requestedPaths).toEqual(['/core.js'])
    expect(readFileSync(cachedCorePath(), 'utf8')).toBe(coreBody)
  })

  it.skipIf(dropInCoreExists)('discards downloaded bytes that do not match the pin', async () => {
    const plugin = Cubism2Core({ downloadUrl: `${origin}/substituted.js`, downloadSha256: coreSha256, cacheDir: cacheDirectory })

    expect(await runConfigHook(plugin)).toEqual({ define: { __AIRI_CUBISM2_CORE_PATH__: 'null' } })
    expect(existsSync(cachedCorePath())).toBe(false)
    expect(recordedWarnings.some(warning => warning.includes('does not match its pinned checksum'))).toBe(true)
  })

  it.skipIf(dropInCoreExists)('still serves a verified core when it cannot be cached', async () => {
    // A regular file where the cache directory should be makes `mkdir` fail the
    // same way on every platform, unlike permission bits.
    const blockedParent = join(fixtureDirectory, 'not-a-directory')
    writeFileSync(blockedParent, 'this is a file, so nothing can be created beneath it')

    const plugin = Cubism2Core({ downloadUrl: `${origin}/core.js`, downloadSha256: coreSha256, cacheDir: join(blockedParent, 'cache') })

    expect(await runConfigHook(plugin)).toEqual({ define: { __AIRI_CUBISM2_CORE_PATH__: '"assets/js/live2d.min.js"' } })
    expect(recordedWarnings.some(warning => warning.includes('could not be cached at'))).toBe(true)
  })

  it.skipIf(dropInCoreExists)('keeps building when the download fails', async () => {
    const plugin = Cubism2Core({ downloadUrl: `${origin}/gone.js`, downloadSha256: coreSha256, cacheDir: cacheDirectory })

    expect(await runConfigHook(plugin)).toEqual({ define: { __AIRI_CUBISM2_CORE_PATH__: 'null' } })
    expect(recordedWarnings.some(warning => warning.includes('HTTP 404'))).toBe(true)
  })

  it.skipIf(dropInCoreExists)('never requests a custom URL that has no checksum', async () => {
    const plugin = Cubism2Core({ downloadUrl: `${origin}/core.js`, cacheDir: cacheDirectory })

    expect(await runConfigHook(plugin)).toEqual({ define: { __AIRI_CUBISM2_CORE_PATH__: 'null' } })
    expect(requestedPaths).toEqual([])
    expect(recordedWarnings.some(warning => warning.includes('never used unverified'))).toBe(true)
  })

  it.skipIf(dropInCoreExists)('reads the download URL and its checksum from the environment', async () => {
    process.env.AIRI_CUBISM2_CORE_URL = `${origin}/core.js`
    process.env.AIRI_CUBISM2_CORE_URL_SHA256 = coreSha256

    expect(await runConfigHook(Cubism2Core({ cacheDir: cacheDirectory }))).toEqual({ define: { __AIRI_CUBISM2_CORE_PATH__: '"assets/js/live2d.min.js"' } })
    expect(requestedPaths).toEqual(['/core.js'])
  })

  it.skipIf(dropInCoreExists)('never reaches the network when the download is disabled', async () => {
    process.env.AIRI_CUBISM2_CORE_URL = `${origin}/core.js`
    process.env.AIRI_CUBISM2_CORE_URL_SHA256 = coreSha256

    expect(await runConfigHook(Cubism2Core({ downloadUrl: false, cacheDir: cacheDirectory }))).toEqual({ define: { __AIRI_CUBISM2_CORE_PATH__: 'null' } })
    expect(requestedPaths).toEqual([])
  })

  it('does not reach the network when a local core resolves', async () => {
    const localCorePath = join(fixtureDirectory, 'local.js')
    writeFileSync(localCorePath, coreBody)

    const plugin = Cubism2Core({ sourcePath: localCorePath, downloadUrl: `${origin}/core.js`, downloadSha256: coreSha256, cacheDir: cacheDirectory })

    expect(await runConfigHook(plugin)).toEqual({ define: { __AIRI_CUBISM2_CORE_PATH__: '"assets/js/live2d.min.js"' } })
    expect(requestedPaths).toEqual([])
  })
})

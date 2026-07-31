import type { ConfigPluginContext, Plugin } from 'vite'

import process from 'node:process'

import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { Cubism2Core } from './cubism2-core'

/**
 * The `.cubism2` drop-in is real filesystem state these tests cannot own: a
 * developer who places `packages/stage-ui-live2d/.cubism2/live2d.min.js` there
 * has legitimately enabled Cubism 2, which is the opposite of what the
 * "no core resolved" cases assert. Those cases are skipped instead of silently
 * inverting. Path segments mirror the plugin's own resolution, and this file
 * lives in the same directory, so both walk `src/vite` up to the package root.
 */
const dropInCoreExists = existsSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '.cubism2', 'live2d.min.js'))

/**
 * Stands in for the `BasicMinimalPluginContext` Vite binds to `config()`.
 *
 * Warnings are swallowed: the assertions here are about the returned `define`
 * and about which failures throw, and a real logger would only add noise.
 */
const pluginContext: ConfigPluginContext = {
  meta: { rollupVersion: '4.0.0', rolldownVersion: '1.0.0', viteVersion: '8.0.0' },
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: (error) => {
    throw typeof error === 'string' ? new Error(error) : error
  },
}

const environmentKeys = ['AIRI_CUBISM2_CORE_PATH', 'AIRI_CUBISM2_CORE_SHA256'] as const
const savedEnvironment: Partial<Record<(typeof environmentKeys)[number], string>> = {}

let fixtureDirectory: string

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

/** Invokes the plugin's `config()` hook, which is synchronous, and returns its partial config. */
function runConfigHook(plugin: Plugin) {
  const hook = plugin.config
  if (typeof hook !== 'function')
    throw new TypeError('Cubism2Core must expose `config` as a plain function hook.')

  return hook.call(pluginContext, {}, { command: 'build', mode: 'production' })
}

describe('cubism2 core vite plugin', () => {
  beforeAll(() => {
    fixtureDirectory = mkdtempSync(join(tmpdir(), 'airi-cubism2-'))
  })

  beforeEach(() => {
    // A developer machine or CI runner may already provision a core; every case
    // below states its own configuration, so the ambient one is set aside.
    for (const key of environmentKeys) {
      const value = process.env[key]
      if (value !== undefined)
        savedEnvironment[key] = value

      delete process.env[key]
    }
  })

  afterEach(() => {
    for (const key of environmentKeys) {
      const value = savedEnvironment[key]
      if (value === undefined)
        delete process.env[key]
      else
        process.env[key] = value

      delete savedEnvironment[key]
    }
  })

  afterAll(() => {
    rmSync(fixtureDirectory, { recursive: true, force: true })
  })

  it.skipIf(dropInCoreExists)('keeps Cubism 3+ only builds untouched when nothing is configured', () => {
    expect(runConfigHook(Cubism2Core())).toEqual({ define: { __AIRI_CUBISM2_CORE_URL__: 'null' } })
  })

  it.skipIf(dropInCoreExists)('treats a configured path that is not on disk as no core at all', () => {
    const missingPath = join(fixtureDirectory, 'not-provisioned.js')

    expect(runConfigHook(Cubism2Core({ sourcePath: missingPath }))).toEqual({ define: { __AIRI_CUBISM2_CORE_URL__: 'null' } })
  })

  it('points the define at the served core when the checksum matches', () => {
    const core = writeCoreFixture('verified.js', 'window.Live2D = { verified: true }')

    expect(runConfigHook(Cubism2Core({ sourcePath: core.path, sha256: core.sha256 })))
      .toEqual({ define: { __AIRI_CUBISM2_CORE_URL__: '"/assets/js/live2d.min.js"' } })
  })

  it('serves an unpinned core so the local drop-in needs no setup', () => {
    const core = writeCoreFixture('unpinned.js', 'window.Live2D = { pinned: false }')

    expect(runConfigHook(Cubism2Core({ sourcePath: core.path })))
      .toEqual({ define: { __AIRI_CUBISM2_CORE_URL__: '"/assets/js/live2d.min.js"' } })
  })

  it('throws when the resolved core does not match the configured checksum', () => {
    const core = writeCoreFixture('tampered.js', 'window.Live2D = { tampered: true }')
    const wrongSha256 = createHash('sha256').update('a different core').digest('hex')

    expect(() => runConfigHook(Cubism2Core({ sourcePath: core.path, sha256: wrongSha256 })))
      .toThrow(/Cubism 2 core checksum mismatch for/)
  })

  it.skipIf(dropInCoreExists)('throws when a checksum is pinned but no core resolves', () => {
    const missingPath = join(fixtureDirectory, 'never-written.js')
    const orphanSha256 = createHash('sha256').update('nothing to verify').digest('hex')

    expect(() => runConfigHook(Cubism2Core({ sourcePath: missingPath, sha256: orphanSha256 })))
      .toThrow(/checksum is configured but no core file was found/)
  })

  it('reads the core from the environment when no options are passed', () => {
    const core = writeCoreFixture('from-environment.js', 'window.Live2D = { origin: "environment" }')
    process.env.AIRI_CUBISM2_CORE_PATH = core.path
    process.env.AIRI_CUBISM2_CORE_SHA256 = core.sha256

    expect(runConfigHook(Cubism2Core())).toEqual({ define: { __AIRI_CUBISM2_CORE_URL__: '"/assets/js/live2d.min.js"' } })
  })

  it('prefers options.sourcePath over AIRI_CUBISM2_CORE_PATH', () => {
    const preferred = writeCoreFixture('preferred.js', 'window.Live2D = { origin: "options" }')
    const shadowed = writeCoreFixture('shadowed.js', 'window.Live2D = { origin: "environment" }')
    process.env.AIRI_CUBISM2_CORE_PATH = shadowed.path

    // The digest is the observable: it only matches if the option's file was the
    // one read, so a reversed precedence fails here as a checksum mismatch.
    expect(runConfigHook(Cubism2Core({ sourcePath: preferred.path, sha256: preferred.sha256 })))
      .toEqual({ define: { __AIRI_CUBISM2_CORE_URL__: '"/assets/js/live2d.min.js"' } })
  })
})

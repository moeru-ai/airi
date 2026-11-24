import process, { argv, platform, stdout } from 'node:process'

import { rejects } from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { ExtensionHost, FileSystemLoader } from '@proj-airi/plugin-sdk/plugin-host'

const extensionId = 'example-extension'

function createManifest(entrypoints) {
  return {
    manifestVersion: 2,
    kind: 'manifest.extension.airi.moeru.ai',
    id: extensionId,
    version: '1.0.0',
    engines: { airi: '*', runtimes: ['node'] },
    permissions: {},
    entrypoints,
  }
}

function createEntrySource(revision) {
  return `export default {
  id: ${JSON.stringify(extensionId)},
  setup() {
    return { revision: ${JSON.stringify(revision)}, url: import.meta.url }
  },
}`
}

function createHostEntrySource(revision) {
  return `export default {
  id: ${JSON.stringify(extensionId)},
  async setup(ctx) {
    await ctx.modules.register({ id: ${JSON.stringify(revision)} })
  },
}`
}

async function loadPaths(root) {
  const loader = new FileSystemLoader()
  const results = []
  for (const name of ['entry.mjs', 'space 中文 # % %23.mjs']) {
    const path = join(root, name)
    await writeFile(path, createEntrySource(name))

    // A plain filename isolates Node's treatment of the Windows drive letter.
    if (platform === 'win32' && name === 'entry.mjs') {
      await rejects(() => import(path), { code: 'ERR_UNSUPPORTED_ESM_URL_SCHEME' })
    }

    for (const entrypoint of [path, name]) {
      const manifest = createManifest({ node: entrypoint, default: 'missing.mjs' })
      const extension = await loader.loadExtensionFor(manifest, { cwd: root, runtime: 'node' })
      results.push(extension.setup())
    }
  }
  return results
}

async function loadLiteralQuestionMark(root) {
  const name = 'literal?query # %23.mjs'
  await writeFile(join(root, name), createEntrySource('question'))
  const loader = new FileSystemLoader()
  const extension = await loader.loadExtensionFor(createManifest({ default: name }), {
    cwd: root,
    runtime: 'node',
    cacheBustKey: '? & # % 中文',
  })
  return extension.setup()
}

async function loadCachedEntry(root) {
  const path = join(root, 'cache.mjs')
  const manifest = createManifest({ default: path })
  const original = JSON.stringify(manifest)
  const loader = new FileSystemLoader()
  const load = async (cacheBustKey) => {
    const extension = await loader.loadExtensionFor(manifest, { runtime: 'node', cacheBustKey })
    return extension.setup()
  }

  const key = 'A ? & # % + 中文'
  await writeFile(path, createEntrySource('A'))
  const first = await load(key)
  await writeFile(path, createEntrySource('B'))
  const same = await load(key)
  const fresh = await load('B')
  const empty = await load('')
  const omitted = await load(undefined)
  return { first, same, fresh, empty, omitted, unchanged: original === JSON.stringify(manifest) }
}

async function reloadHost(root) {
  const path = join(root, 'host.mjs')
  const manifest = createManifest({ node: 'host.mjs', default: 'missing.mjs' })
  const original = JSON.stringify(manifest)
  const host = new ExtensionHost({ runtime: 'electron' })
  const listModuleIds = () => host.listModules().map(module => module.id)

  await writeFile(path, createHostEntrySource('A'))
  let session = await host.start(manifest, { cwd: root, runtime: 'node', cacheBustKey: 'A' })
  const results = [listModuleIds()]
  await writeFile(path, createHostEntrySource('B'))
  session = await host.reload(session.id, { cacheBustKey: 'A' })
  results.push(listModuleIds())
  session = await host.reload(session.id)
  results.push(listModuleIds())
  await writeFile(path, createHostEntrySource('C'))
  session = await host.reload(session.id)
  results.push(listModuleIds())
  session = await host.reload(session.id, { cacheBustKey: '' })
  results.push(listModuleIds())
  const sessionManifestUnchanged = JSON.stringify(session.manifest) === original

  await host.stop(session.id)
  return {
    results,
    sessionManifestUnchanged,
    manifestUnchanged: JSON.stringify(manifest) === original,
    sessions: host.listSessions(),
  }
}

async function startWithMissingEntrypoint(root) {
  const host = new ExtensionHost({ runtime: 'node' })
  const manifest = createManifest({ node: 'missing.mjs' })
  const errorCode = await host.start(manifest, { cwd: root }).then(() => null, error => error.code)
  return { errorCode, sessions: host.listSessions() }
}

const probes = {
  'paths': loadPaths,
  'literal-question-mark': loadLiteralQuestionMark,
  'cache': loadCachedEntry,
  'host-reload': reloadHost,
  'missing-entrypoint': startWithMissingEntrypoint,
}

/**
 * Runs the selected scenario in the temporary directory from the CLI arguments.
 * Writes JSON to stdout. On failure, the caller reports the error to stderr and sets exit code 1.
 *
 * Call stack:
 *
 * runNativeEntrypointProbe (Vitest)
 *   -> main (native Node)
 *     -> {@link probes} (selected scenario)
 *       -> FileSystemLoader or ExtensionHost
 */
async function main() {
  const [, , scenario, root] = argv
  if (!root || !Object.hasOwn(probes, scenario)) {
    throw new Error('Pass a known probe scenario and its temporary directory.')
  }

  stdout.write(JSON.stringify(await probes[scenario](root)))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

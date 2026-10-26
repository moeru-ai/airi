import process, { exit } from 'node:process'

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'

import { cac } from 'cac'

/** Maps each file path in a build output, relative to its root and with `/` separators, to its SHA-256 digest. */
export type OutputManifest = Map<string, string>

export interface OutputManifestDiff {
  /** Files that exist in both outputs with different bytes. */
  changed: string[]
  /** Files that exist only in the first output. */
  removed: string[]
  /** Files that exist only in the second output. */
  added: string[]
}

const packageRoot = resolve(import.meta.dirname, '..')

/**
 * The files that can differ when only the commit changes.
 *
 * `electron.vite.config.ts` puts `~build/git` and `~build/time` into the renderer chunk `build-info.js`, which has no hash
 * in its name. `bundle.json` lists the hash of each file of the bundle, so it changes with that chunk.
 */
export const commitDependentFiles: ReadonlySet<string> = new Set(['bundle.json', 'bundle/renderer/assets/build-info.js'])

/**
 * The environment of each build. The second build has another build time, as a new commit has.
 * The release IDs come from the clock when they are not set, so both builds set the same IDs.
 */
const buildEnvironments: Record<string, string>[] = [
  { SOURCE_DATE_EPOCH: '1700000000', ERGOSPHERE_IT_RELEASE_ID: '1700000000000', ERGOSPHERE_IT_INSTALLER_RELEASE_ID: '1700000000000' },
  { SOURCE_DATE_EPOCH: '1700086400', ERGOSPHERE_IT_RELEASE_ID: '1700000000000', ERGOSPHERE_IT_INSTALLER_RELEASE_ID: '1700000000000' },
]

/**
 * Hashes every file under `root`.
 *
 * Paths use `/` on every platform, so manifests from different hosts can be compared.
 */
export async function createOutputManifest(root: string): Promise<OutputManifest> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  const files = entries
    .filter(entry => entry.isFile())
    .map(entry => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort()

  const manifest: OutputManifest = new Map()
  for (const file of files)
    manifest.set(file, createHash('sha256').update(await readFile(join(root, file))).digest('hex'))

  return manifest
}

export function diffOutputManifests(first: OutputManifest, second: OutputManifest): OutputManifestDiff {
  const diff: OutputManifestDiff = { changed: [], removed: [], added: [] }

  for (const [file, digest] of first) {
    const otherDigest = second.get(file)
    if (otherDigest == null)
      diff.removed.push(file)
    else if (otherDigest !== digest)
      diff.changed.push(file)
  }

  for (const file of second.keys()) {
    if (!first.has(file))
      diff.added.push(file)
  }

  return diff
}

/** Removes the files that can differ between two commits from a diff. Each file that stays is a reproducibility bug. */
export function unexpectedDifferences(diff: OutputManifestDiff, allowed: ReadonlySet<string>): OutputManifestDiff {
  return {
    changed: diff.changed.filter(file => !allowed.has(file)),
    removed: diff.removed.filter(file => !allowed.has(file)),
    added: diff.added.filter(file => !allowed.has(file)),
  }
}

async function buildOutput(environment: Record<string, string>) {
  // `out/` holds the main, preload, and renderer bundles. Remove it, so that no file of an earlier build stays.
  await rm(join(packageRoot, 'out'), { recursive: true, force: true })

  // On Windows, `pnpm` is a `.cmd` shim, and only a shell can start it.
  const result = spawnSync('pnpm', ['exec', 'electron-vite', 'build'], {
    cwd: packageRoot,
    env: { ...process.env, ...environment },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0)
    throw new Error(`electron-vite build failed with exit code ${result.status}`)
}

/**
 * Builds `out/` two times from the same source, with two build times, and fails when a file differs.
 * Only {@link commitDependentFiles} can differ.
 *
 * A core update compares the file hashes of `out/` to find the changed files. A build that is not reproducible
 * changes the hashes of files that did not change in the source. If the build time gets into a chunk with a hash
 * in its name, each new commit renames that chunk and each chunk that imports it.
 *
 * Call stack:
 *
 * main
 *   -> {@link buildOutput} (two times, each output copied to a temporary directory)
 *     -> {@link createOutputManifest}
 *   -> {@link diffOutputManifests}
 *   -> {@link unexpectedDifferences}
 */
async function main() {
  const cli = cac('check-reproducible-build')
    .option('--keep', 'Keep the copies of the two outputs for inspection')

  const args = cli.parse()
  const workDir = await mkdtemp(join(tmpdir(), 'airi-reproducible-build-'))
  const manifests: OutputManifest[] = []

  for (const [index, name] of ['first', 'second'].entries()) {
    await buildOutput(buildEnvironments[index])
    await cp(join(packageRoot, 'out'), join(workDir, name), { recursive: true })
    manifests.push(await createOutputManifest(join(workDir, name)))
  }

  const diff = unexpectedDifferences(diffOutputManifests(manifests[0], manifests[1]), commitDependentFiles)
  const differences = diff.changed.length + diff.removed.length + diff.added.length

  for (const file of diff.changed)
    console.error(`changed: ${file}`)
  for (const file of diff.removed)
    console.error(`only in the first build: ${file}`)
  for (const file of diff.added)
    console.error(`only in the second build: ${file}`)

  if (args.options.keep)
    console.info(`The outputs are in ${workDir}`)
  else
    await rm(workDir, { recursive: true, force: true })

  if (differences > 0) {
    console.error(`${differences} of ${manifests[0].size} files are different between the two builds.`)
    exit(1)
  }

  console.info(`The two builds are the same, except for the build time: ${manifests[0].size} files.`)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error)
    exit(1)
  })
}

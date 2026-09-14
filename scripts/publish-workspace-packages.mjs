#!/usr/bin/env bun
/**
 * Publishes every public workspace package to the npm registry.
 *
 * Replaces the recursive publish that `pnpm publish -r` provided before the Bun
 * migration. Bun's `publish` command targets the package in one directory, so
 * this script enumerates the workspaces declared in the root manifest, skips
 * private packages, and publishes the rest in name order.
 *
 * Call stack:
 *
 * `bun run publish:packages`
 *   -> {@link workspaceDirs}
 *     -> `bun publish` (one process per package)
 *
 * Usage:
 *
 *   bun run publish:packages -- --dry-run
 */

import process from 'node:process'

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

function readManifest(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * Expands the root `workspaces` patterns into candidate directories.
 *
 * The root manifest only uses two pattern shapes: an exact directory, and one
 * trailing `/*` level. Built output such as `packages/<name>/dist` is therefore
 * never enumerated.
 */
function* workspaceDirs(patterns) {
  for (const pattern of patterns) {
    if (!pattern.endsWith('/*')) {
      yield join(root, pattern)
      continue
    }

    const parent = join(root, pattern.slice(0, -2))
    if (!existsSync(parent))
      continue

    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith('.'))
        yield join(parent, entry.name)
    }
  }
}

const rootManifest = readManifest(join(root, 'package.json'))
const publishable = []

for (const dir of workspaceDirs(rootManifest.workspaces ?? [])) {
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath) || !statSync(manifestPath).isFile())
    continue

  const manifest = readManifest(manifestPath)
  if (!manifest.name || manifest.private)
    continue

  publishable.push({ name: manifest.name, dir })
}

publishable.sort((a, b) => a.name.localeCompare(b.name))

const forwarded = process.argv.slice(2)

for (const { name, dir } of publishable) {
  console.info(`publish: ${name}`)
  const result = spawnSync('bun', ['publish', '--access', 'public', ...forwarded], { cwd: dir, stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`publish: ${name} failed with exit code ${result.status}`)
    process.exit(result.status ?? 1)
  }
}

console.info(`publish: ${publishable.length} package(s) processed`)

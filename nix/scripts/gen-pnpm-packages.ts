#!/usr/bin/env tsx
/**
 * gen-pnpm-packages.ts — Generate JSON package list from pnpm-lock.yaml
 * for Nix-based per-package CAFS store building.
 *
 * Run with: pnpm run nix:gen
 *
 * Generates:
 *   nix/pnpm-packages.json — one entry per package (name, version, url, integrity)
 *
 * The hand-written nix/pnpm-store.nix reads this JSON via builtins.fromJSON
 * and creates per-package Nix derivations from it.
 */

import process from 'node:process'

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parse as parseYaml } from 'yaml'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..', '..')
const nixDir = join(repoRoot, 'nix')

// ---------------------------------------------------------------------------
// Parse pnpm-lock.yaml
// ---------------------------------------------------------------------------

interface PnpmPackageEntry {
  resolution: {
    integrity: string
    tarball?: string
  }
  engines?: Record<string, string>
  hasBin?: boolean
  cpu?: string[]
  os?: string[]
  libc?: string[]
  deprecated?: string
  bundled?: boolean
}

interface PnpmLockfile {
  lockfileVersion: string
  packages?: Record<string, PnpmPackageEntry>
}

const lockfilePath = join(repoRoot, 'pnpm-lock.yaml')
console.info('Reading pnpm-lock.yaml...')
const lockfileContent = readFileSync(lockfilePath, 'utf-8')
const lockfile = parseYaml(lockfileContent) as PnpmLockfile

if (!lockfile.packages || Object.keys(lockfile.packages).length === 0) {
  console.error('No packages found in pnpm-lock.yaml')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Extract packages
// ---------------------------------------------------------------------------

interface PackageEntry {
  name: string
  version: string
  url: string
  integrity: string
}

/**
 * Compute the npm registry tarball URL from a package name and version.
 * Scoped packages: @scope/name → registry.npmjs.org/@scope/name/-/name-version.tgz
 * Unscoped: name → registry.npmjs.org/name/-/name-version.tgz
 */
function npmTarballUrl(name: string, version: string): string {
  const unscopedName = name.includes('/') ? name.split('/')[1] : name
  return `https://registry.npmjs.org/${name}/-/${unscopedName}-${version}.tgz`
}

const packages: Record<string, PackageEntry> = {}

for (const [key, entry] of Object.entries(lockfile.packages)) {
  if (entry.bundled) {
    continue
  }

  // Parse "name@version" — last @ is the separator (handles @scope/name@version)
  const lastAt = key.lastIndexOf('@')
  const name = key.slice(0, lastAt)
  const version = key.slice(lastAt + 1)

  const integrity = entry.resolution?.integrity
  if (!integrity) {
    console.warn(`Skipping ${key}: no integrity hash`)
    continue
  }
  if (!integrity.startsWith('sha512-')) {
    console.warn(`Skipping ${key}: unsupported integrity format ${integrity.split('-')[0]}`)
    continue
  }

  const url = entry.resolution?.tarball ?? npmTarballUrl(name, version)

  packages[key] = { name, version, url, integrity }
}

const count = Object.keys(packages).length
console.info(`Found ${count} packages`)

// ---------------------------------------------------------------------------
// Write nix/pnpm-packages.json
// ---------------------------------------------------------------------------

const outputPath = join(nixDir, 'pnpm-packages.json')

// Sort keys for stable output
const sorted: Record<string, PackageEntry> = {}
for (const key of Object.keys(packages).sort()) {
  sorted[key] = packages[key]
}

// ---------------------------------------------------------------------------
// Runtime dependencies of nix/scripts/pnpm-cafs-add.ts
// These are the npm packages needed to run the CAFS script directly (without
// bundling). Listed here so pnpm-store.nix can fetchurl + extract them into
// a node_modules for the script. Update this list when @pnpm/store.cafs or
// @pnpm/constants changes.
// ---------------------------------------------------------------------------

const cafsScriptDeps = [
  '@pnpm/constants@1001.3.1',
  '@pnpm/graceful-fs@1000.1.0',
  '@pnpm/store.cafs@1000.1.4',
  '@zkochan/rimraf@3.0.2',
  'better-path-resolve@1.0.0',
  'fs-extra@11.3.0',
  'graceful-fs@4.2.11',
  'is-gzip@2.0.0',
  'is-subdir@1.2.0',
  'is-windows@1.0.2',
  'jsonfile@6.2.0',
  'minipass@7.1.3',
  'rename-overwrite@6.0.6',
  'ssri@10.0.5',
  'strip-bom@4.0.0',
  'universalify@2.0.1',
]

// Verify all deps are present in the lockfile
for (const dep of cafsScriptDeps) {
  if (!sorted[dep]) {
    console.error(`CAFS script dependency ${dep} not found in lockfile`)
    process.exit(1)
  }
}

const output = { cafsScriptDeps, packages: sorted }

console.info('Generating nix/pnpm-packages.json...')
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)

console.info(`Done. Generated ${count} package entries.`)
console.info('  nix/pnpm-packages.json')
console.info('')
console.info('Next: commit this file, then run: nix build .#airi.pnpmDeps')

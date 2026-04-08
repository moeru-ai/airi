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

const output = { packages: sorted }

console.info('Generating nix/pnpm-packages.json...')
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)

console.info(`Done. Generated ${count} package entries.`)
console.info('  nix/pnpm-packages.json')
console.info('')
console.info('Next: commit this file, then run: nix build .#airi.pnpmDeps')

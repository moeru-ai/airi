#!/usr/bin/env node
/**
 * pnpm-cafs-add — Write a single npm tarball into a pnpm CAFS store fragment
 * using pnpm's own @pnpm/store.cafs library.
 *
 * Usage:
 *   node pnpm-cafs-add.mjs <tarball.tgz> <output-dir> <name@version> <sha512-base64>
 *
 * The output-dir will contain the complete store structure:
 *   output-dir/.fetcher-version                    ← "2" (raw directory format)
 *   output-dir/<STORE_VERSION>/files/...           ← content-addressed files
 *   output-dir/<STORE_VERSION>/index/...           ← package index JSON
 *
 * ALL pnpm format knowledge is encapsulated here via @pnpm/store.cafs and
 * @pnpm/constants. The Nix merge derivation is completely format-agnostic.
 */

import process from 'node:process'

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { STORE_VERSION } from '@pnpm/constants'
import { createCafs } from '@pnpm/store.cafs'

const [,, tarballPath, outputDir, nameVersion, integrityArg] = process.argv

if (!tarballPath || !outputDir || !nameVersion || !integrityArg) {
  console.error('Usage: pnpm-cafs-add <tarball.tgz> <output-dir> <name@version> <sha512-base64>')
  process.exit(1)
}

// Parse name@version — handle @scope/name@version where last @ is the separator
const lastAt = nameVersion.lastIndexOf('@')
const pkgName = nameVersion.slice(0, lastAt)
const pkgVersion = nameVersion.slice(lastAt + 1)

// The CAFS store lives under the version subdirectory (e.g. "v10")
const cafsDir = join(outputDir, STORE_VERSION)

// Read the tarball into memory and let pnpm extract + hash all files
const tarballBuffer = readFileSync(tarballPath)
const cafs = createCafs(cafsDir)
const { filesIndex } = cafs.addFilesFromTarball(tarballBuffer)

// Build the index JSON — this part is not handled by @pnpm/store.cafs.
// The library writes individual files to the CAFS store and returns metadata;
// we serialize it into the index format that pnpm's installer expects.
const files: Record<string, { integrity: string, mode: number, size: number }> = {}
for (const [relPath, info] of Object.entries(filesIndex) as [string, { integrity: { toString: () => string }, mode: number, size: number }][]) {
  // NOTICE: checkedAt is intentionally omitted (matches nixpkgs pnpm.fetchDeps
  // behaviour: `jq "del(.. | .checkedAt?)"` strips it from all index files).
  // When present with a stale timestamp, pnpm may trigger integrity re-verification
  // which can fail unexpectedly in the Nix sandbox.
  files[relPath] = {
    integrity: info.integrity.toString(),
    mode: info.mode,
    size: info.size,
  }
}

// Use pnpm's own path computation for the index file
// NOTICE: the type declaration says FileType but the implementation accepts pkgId: string
const indexPath = cafs.getIndexFilePathInCafs(integrityArg, nameVersion as never)
mkdirSync(dirname(indexPath), { recursive: true })
writeFileSync(indexPath, JSON.stringify({
  name: pkgName,
  version: pkgVersion,
  requiresBuild: false,
  files,
}))

// fetcherVersion=2 tells pnpmConfigHook the store is a raw directory (not a tarball)
writeFileSync(join(outputDir, '.fetcher-version'), '2')

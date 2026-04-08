#!/usr/bin/env node
/**
 * pnpm-cafs-add — Write a single npm tarball into a pnpm CAFS store fragment
 * using pnpm's own @pnpm/store.cafs library.
 *
 * Usage:
 *   node pnpm-cafs-add.bundled.mjs <tarball.tgz> <output-dir> <name@version> <sha512-base64>
 *
 * The output-dir will contain the partial store structure:
 *   output-dir/files/{hex[:2]}/{hex[2:]}[-exec]
 *   output-dir/index/{hex[:2]}/{hex[2:64]}-{name+version}.json
 *
 * This script delegates all CAFS logic (hashing, file placement, -exec suffix)
 * to @pnpm/store.cafs — pnpm's own implementation. This ensures the output format
 * automatically tracks pnpm's internal store layout across versions.
 */

import process from 'node:process'

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

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

// Read the tarball into memory and let pnpm extract + hash all files
const tarballBuffer = readFileSync(tarballPath)
const cafs = createCafs(outputDir)
const { filesIndex } = cafs.addFilesFromTarball(tarballBuffer)

// Build the index JSON — this part is not handled by @pnpm/store.cafs.
// The library writes individual files to the CAFS store and returns metadata;
// we serialize it into the index format that pnpm's installer expects.
const files: Record<string, { integrity: string, mode: number, size: number }> = {}
for (const [relPath, info] of Object.entries(filesIndex)) {
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
const indexPath = cafs.getIndexFilePathInCafs(integrityArg, nameVersion)
mkdirSync(dirname(indexPath), { recursive: true })
writeFileSync(indexPath, JSON.stringify({
  name: pkgName,
  version: pkgVersion,
  requiresBuild: false,
  files,
}))

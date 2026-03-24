#!/usr/bin/env node
/**
 * cafs-add.mjs — Write a single npm tarball into a pnpm CAFS v10 store fragment.
 *
 * Usage:
 *   node cafs-add.mjs <tarball.tgz> <output-dir> <name@version> [sha512-<base64>]
 *
 * The output-dir will contain the partial store structure:
 *   output-dir/files/{hex[:2]}/{hex[2:]}
 *   output-dir/index/{ihex[:2]}/{ihex[2:64]}-{name+version}.json
 *
 * The 4th argument (integrity) can be omitted; it will be computed from the tarball.
 * Passing it avoids re-hashing the entire tarball.
 */

import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [,, tarballPath, outputDir, nameVersion, integrityArg] = process.argv

if (!tarballPath || !outputDir || !nameVersion) {
  console.error('Usage: cafs-add.mjs <tarball.tgz> <output-dir> <name@version> [sha512-<base64>]')
  process.exit(1)
}

// Parse name@version — handle @scope/name@version where last @ is the separator
const lastAt = nameVersion.lastIndexOf('@')
const pkgName = nameVersion.slice(0, lastAt)
const pkgVersion = nameVersion.slice(lastAt + 1)

// Compute or decode the tarball integrity (sha512)
let integrityB64
if (integrityArg && integrityArg.startsWith('sha512-')) {
  integrityB64 = integrityArg.slice('sha512-'.length)
}
else {
  const tarContent = readFileSync(tarballPath)
  integrityB64 = createHash('sha512').update(tarContent).digest('base64')
}
const integrityHex = Buffer.from(integrityB64, 'base64').toString('hex')

// Index filename: replace / with + in scoped names (pnpm convention)
const indexName = pkgName.replace('/', '+')
const indexDir = join(outputDir, 'index', integrityHex.slice(0, 2))
const indexFilename = `${integrityHex.slice(2, 64)}-${indexName}@${pkgVersion}.json`
const indexPath = join(indexDir, indexFilename)

// Extract tarball to a temp directory
const tmpDir = mkdtempSync(join(tmpdir(), 'cafs-add-'))
try {
  // NOTICE: --no-same-permissions forces tar to use the current umask instead of
  // tarball-stored permissions. Some npm tarballs (e.g. pngjs) store the top-level
  // "package/" directory as mode 0555; without this flag tar creates it read-only
  // then immediately fails to write subsequent files into it.
  execSync(`tar -xzf ${JSON.stringify(tarballPath)} -C ${JSON.stringify(tmpDir)} --no-same-permissions`, { stdio: 'pipe' })

  // NOTICE: even with --no-same-permissions, the umask only removes bits from 0777;
  // it cannot ADD the user-write bit if the archive stored 0555 for a directory.
  // chmod -R u+rwX ensures all extracted files/dirs are user-readable and writable
  // so the walk below can read them and the finally block can remove them.
  execSync(`chmod -R u+rwX ${JSON.stringify(tmpDir)}`)

  // npm tarballs always have a single top-level "package/" directory; strip it
  const topLevel = readdirSync(tmpDir)
  const pkgRoot = topLevel.length === 1 ? join(tmpDir, topLevel[0]) : tmpDir

  /** @type {Record<string, {checkedAt: number, integrity: string, mode: number, size: number}>} */
  const filesIndex = {}

  /**
   * Walk the extracted package directory, write each file into CAFS files/,
   * and collect the index entry.
   */
  function walk(dir, relPrefix) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name

      if (entry.isDirectory()) {
        walk(fullPath, relPath)
      }
      else if (entry.isFile()) {
        const content = readFileSync(fullPath)
        const stat = statSync(fullPath)

        // Compute SHA512 of file content
        const fileHash = createHash('sha512').update(content).digest()
        const fileHex = fileHash.toString('hex')
        const fileB64 = fileHash.toString('base64')

        // Write to files/{hex[:2]}/{hex[2:]}
        const destDir = join(outputDir, 'files', fileHex.slice(0, 2))
        const destPath = join(destDir, fileHex.slice(2))
        mkdirSync(destDir, { recursive: true })
        // Skip if already written (content-addressed, same hash = same file)
        try {
          writeFileSync(destPath, content, { flag: 'wx' })
        }
        catch (e) {
          if (e.code !== 'EEXIST')
            throw e
        }

        // NOTICE: mode is stored as decimal integer (e.g. 420 = 0o644, 493 = 0o755)
        // pnpm uses this value when recreating the file in node_modules
        const isExec = !!(stat.mode & 0o111)
        const mode = isExec ? 0o755 : 0o644 // 493 or 420

        // NOTICE: checkedAt is set to a fixed epoch (1) for Nix reproducibility.
        // pnpm uses this timestamp to decide whether to re-verify file integrity.
        // A value of 1 is treated as "very old" but causes no correctness issues
        // since pnpm install --offline skips network verification anyway.
        filesIndex[relPath] = {
          checkedAt: 1,
          integrity: `sha512-${fileB64}`,
          mode,
          size: content.length,
        }
      }
      // Symlinks are intentionally skipped — pnpm CAFS does not store symlinks
    }
  }

  walk(pkgRoot, '')

  // Write index file
  mkdirSync(indexDir, { recursive: true })
  writeFileSync(indexPath, JSON.stringify({
    name: pkgName,
    version: pkgVersion,
    requiresBuild: false,
    files: filesIndex,
  }))
}
finally {
  execSync(`rm -rf ${JSON.stringify(tmpDir)}`)
}

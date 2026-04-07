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
import { closeSync, constants, copyFileSync, mkdirSync, mkdtempSync, openSync, readdirSync, readSync, statSync } from 'node:fs'
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
  // Stream-hash via openssl to avoid loading the whole tarball into memory
  const result = execSync(`openssl dgst -sha512 -binary ${JSON.stringify(tarballPath)}`)
  integrityB64 = result.toString('base64')
}
const integrityHex = Buffer.from(integrityB64, 'base64').toString('hex')

// Index filename: replace / with + in scoped names (pnpm convention)
const indexName = pkgName.replace('/', '+')
const indexDir = join(outputDir, 'index', integrityHex.slice(0, 2))
const indexFilename = `${integrityHex.slice(2, 64)}-${indexName}@${pkgVersion}.json`
const indexPath = join(indexDir, indexFilename)

/**
 * Compute the SHA512 hash of a file via 256 KB chunked reads.
 * Avoids loading the entire file into memory at once (important for large
 * binary packages like app-builder-bin, electron, etc.)
 */
const CHUNK = Buffer.allocUnsafe(256 * 1024)
function hashFile(filePath) {
  const hash = createHash('sha512')
  const fd = openSync(filePath, 'r')
  try {
    let n
    do {
      n = readSync(fd, CHUNK, 0, CHUNK.byteLength, null)
      if (n > 0)
        hash.update(n === CHUNK.byteLength ? CHUNK : CHUNK.subarray(0, n))
    } while (n === CHUNK.byteLength)
  }
  finally {
    closeSync(fd)
  }
  return hash.digest()
}

// Extract tarball to a temp directory
const tmpDir = mkdtempSync(join(tmpdir(), 'cafs-add-'))
try {
  // NOTICE: some npm tarballs (e.g. pngjs) store directories with mode 0666
  // (rw-rw-rw-, no execute bit). GNU tar applies the process umask (0022) to get
  // 0644 — still no execute. Without execute, tar cannot traverse into a directory
  // to write sub-files, so extraction partially fails.
  //
  // Two-pass workaround:
  //   1. First extraction — partially succeeds (files directly in non-exec dirs fail)
  //   2. chmod -R u+rwX — adds execute to all directories
  //   3. Second extraction with --no-overwrite-dir — keeps our fixed permissions and
  //      writes the previously-skipped files
  // NOTICE: some npm tarballs have NESTED directories with no-execute mode (e.g.
  // pixi-live2d-display has package/cubism/.vscode/ where both cubism/ and .vscode/
  // are stored as 0644). A single two-pass is not enough: pass 1 creates cubism/
  // as 0644, chmod fixes it, pass 2 creates .vscode/ as 0644, chmod fixes it,
  // pass 3 finally writes the files. We loop until tar exits 0 or give up at 10.
  for (let pass = 0; pass < 10; pass++) {
    try {
      execSync(`tar -xzf ${JSON.stringify(tarballPath)} -C ${JSON.stringify(tmpDir)} --no-same-permissions --no-overwrite-dir`, { stdio: 'pipe' })
      break // success
    }
    catch (e) {
      if (pass === 9)
        throw e
      execSync(`chmod -R u+rwX ${JSON.stringify(tmpDir)}`)
    }
  }

  // NOTICE: chmod unconditionally after extraction — some tarballs store directories
  // with non-executable modes (e.g. 0600 or 0555). GNU tar with --no-same-permissions
  // only applies the umask, which cannot *add* bits. Critically, tar sets directory
  // permissions *after* writing all children into them: so extraction can exit 0
  // while leaving directories non-traversable. Without execute on a parent directory,
  // statSync/readdirSync of children will fail with EACCES. The loop above only
  // calls chmod on failure; this call handles the case where tar succeeds but still
  // produces non-executable dirs.
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
        const stat = statSync(fullPath)

        // Compute SHA512 via chunked reads — avoids holding the whole file in memory
        const fileHash = hashFile(fullPath)
        const fileHex = fileHash.toString('hex')
        const fileB64 = fileHash.toString('base64')

        // NOTICE: mode is stored as decimal integer (e.g. 420 = 0o644, 493 = 0o755)
        // pnpm uses this value when recreating the file in node_modules
        const isExec = !!(stat.mode & 0o111)
        const mode = isExec ? 0o755 : 0o644 // 493 or 420

        // NOTICE: pnpm CAFS v10 uses a "-exec" filename suffix for executable files.
        // Without the suffix, pnpm cannot locate binaries in the store and falls back
        // to downloading, which fails in offline mode. Non-executable files have no
        // suffix. See nixpkgs pkgs/development/tools/pnpm/fetch-deps/default.nix
        // fixupPhase: `find $out -type f -name "*-exec" -print0 | xargs -0 chmod 555`.
        const cafsName = isExec ? `${fileHex.slice(2)}-exec` : fileHex.slice(2)

        // Write to files/{hex[:2]}/{hex[2:]} or files/{hex[:2]}/{hex[2:]}-exec
        const destDir = join(outputDir, 'files', fileHex.slice(0, 2))
        const destPath = join(destDir, cafsName)
        mkdirSync(destDir, { recursive: true })
        // Copy without loading into memory; COPYFILE_EXCL = fail if dest exists (CAFS: same hash = same file)
        try {
          copyFileSync(fullPath, destPath, constants.COPYFILE_EXCL)
        }
        catch (e) {
          if (e.code !== 'EEXIST')
            throw e
        }

        // NOTICE: checkedAt is intentionally omitted (matches nixpkgs pnpm.fetchDeps
        // behaviour: `jq "del(.. | .checkedAt?)"` strips it from all index files).
        // When present with a stale timestamp, pnpm may trigger integrity re-verification
        // which can fail unexpectedly in the Nix sandbox.
        filesIndex[relPath] = {
          integrity: `sha512-${fileB64}`,
          mode,
          size: stat.size,
        }
      }
      // Symlinks are intentionally skipped — pnpm CAFS does not store symlinks
    }
  }

  walk(pkgRoot, '')

  // Write index file
  mkdirSync(indexDir, { recursive: true })
  execSync(`cat > ${JSON.stringify(indexPath)}`, {
    input: JSON.stringify({
      name: pkgName,
      version: pkgVersion,
      requiresBuild: false,
      files: filesIndex,
    }),
  })
}
finally {
  // NOTICE: chmod before rm — some tarballs extract directories with mode 0555
  // (no write bit). Even with --no-same-permissions, tar only masks the umask;
  // it cannot add bits, so 0555 dirs stay non-writable and rm -rf fails.
  // This is unconditional because chmod in the extraction loop only fires on
  // failure, so a tarball that extracts successfully on the first pass but has
  // non-writable dirs would make rm -rf fail during cleanup.
  execSync(`chmod -R u+rwX ${JSON.stringify(tmpDir)}`)
  execSync(`rm -rf ${JSON.stringify(tmpDir)}`)
}

import process from 'node:process'

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, readFile, rmdir, stat, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { isWindows } from 'std-env'

export interface CleanupPendingInstallersOptions {
  cacheDir?: string
  retries?: number
  retryDelayMs?: number
}

export function getWindowsUpdaterCacheDir(): string {
  return process.env.AIRI_UPDATER_CACHE_DIR
    || join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'ai.moeru.airi-updater')
}

export async function hashFileSha512(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512')
    createReadStream(filePath)
      .on('data', chunk => hash.update(chunk))
      .on('end', () => resolve(hash.digest('base64')))
      .on('error', reject)
  })
}

// WORKAROUND:
// NOTICE:
// Why: Clean up redundant pending installers after an update on Windows.
// Root cause: NSIS copies the installer to installer.exe for differential updates. The downloaded installer remains in the pending directory.
// Source: https://github.com/moeru-ai/airi/issues/3469
// Removal condition: electron-updater cleans up matching pending installers on Windows.
export async function cleanupRedundantPendingInstallers(options?: CleanupPendingInstallersOptions): Promise<{ cleaned: string[] }> {
  const cleaned: string[] = []
  if (!isWindows && !options?.cacheDir)
    return { cleaned }

  const cacheDir = options?.cacheDir ?? getWindowsUpdaterCacheDir()
  const rootInstallerPath = join(cacheDir, 'installer.exe')
  const pendingDir = join(cacheDir, 'pending')

  const rootStat = await stat(rootInstallerPath).catch(() => undefined)
  if (!rootStat || !rootStat.isFile())
    return { cleaned }

  const entries = await readdir(pendingDir, { withFileTypes: true }).catch(() => [])
  if (entries.length === 0)
    return { cleaned }

  const updateInfoPath = join(pendingDir, 'update-info.json')

  let rootHash: string | undefined
  async function getRootHash(): Promise<string> {
    rootHash ??= await hashFileSha512(rootInstallerPath)
    return rootHash
  }

  const retries = options?.retries ?? 3
  const retryDelayMs = options?.retryDelayMs ?? 500

  async function deleteWithRetry(filePath: string): Promise<boolean> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        await unlink(filePath)
        return true
      }
      catch (error: unknown) {
        const err = error as { code?: string }
        if (err?.code === 'ENOENT')
          return true
        if ((err?.code === 'EBUSY' || err?.code === 'EPERM' || err?.code === 'EACCES') && attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, retryDelayMs))
          continue
        }
        return false
      }
    }
    return false
  }

  let deletedMatchingInstaller = false

  for (const entry of entries) {
    if (!entry.isFile() || entry.name === 'update-info.json')
      continue

    const filePath = join(pendingDir, entry.name)
    const fileStat = await stat(filePath).catch(() => undefined)
    if (!fileStat || !fileStat.isFile())
      continue

    if (fileStat.size !== rootStat.size)
      continue

    const currentRootHash = await getRootHash().catch(() => undefined)
    if (!currentRootHash)
      continue

    const fileHash = await hashFileSha512(filePath).catch(() => undefined)
    if (fileHash && fileHash === currentRootHash) {
      const deleted = await deleteWithRetry(filePath)
      if (deleted) {
        cleaned.push(entry.name)
        deletedMatchingInstaller = true
      }
    }
  }

  if (deletedMatchingInstaller) {
    let shouldDeleteInfo = true
    try {
      const infoContent = await readFile(updateInfoPath, 'utf8')
      const parsed = JSON.parse(infoContent) as { fileName?: string }
      if (parsed.fileName && !cleaned.includes(parsed.fileName))
        shouldDeleteInfo = false
    }
    catch {
      // If reading or parsing fails, delete the potentially corrupt or missing metadata.
    }

    if (shouldDeleteInfo) {
      const deletedInfo = await deleteWithRetry(updateInfoPath)
      if (deletedInfo)
        cleaned.push('update-info.json')
    }

    const remaining = await readdir(pendingDir).catch(() => [])
    if (remaining.length === 0)
      await rmdir(pendingDir).catch(() => {})
  }

  return { cleaned }
}

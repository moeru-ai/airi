import { readdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

export interface RetentionPolicy {
  maxAgeDays: number
  maxSizeMb: number
}

export const DEFAULT_RETENTION: RetentionPolicy = {
  maxAgeDays: 7,
  maxSizeMb: 1024,
}

export async function pruneByAge(directory: string, maxAgeDays: number): Promise<number> {
  const cutoff = Date.now() - maxAgeDays * 86400000
  let removed = 0

  try {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(directory, entry.name)
      try {
        const stats = await stat(fullPath)
        if (stats.mtimeMs < cutoff) {
          await rm(fullPath, { recursive: true, force: true })
          removed++
        }
      }
      catch {
        // skip inaccessible entries
      }
    }
  }
  catch {
    // directory may not exist
  }

  return removed
}

export async function getDirectorySizeMb(directory: string): Promise<number> {
  let totalBytes = 0

  async function walk(dir: string): Promise<void> {
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        try {
          if (entry.isFile()) {
            const stats = await stat(fullPath)
            totalBytes += stats.size
          }
          else if (entry.isDirectory()) {
            await walk(fullPath)
          }
        }
        catch {
          // skip inaccessible
        }
      }
    }
    catch {
      // directory may not exist
    }
  }

  await walk(directory)
  return totalBytes / (1024 * 1024)
}

/**
 * Prune files by size: removes oldest files first until directory is under maxSizeMb.
 */
export async function pruneBySize(directory: string, maxSizeMb: number): Promise<number> {
  const currentSize = await getDirectorySizeMb(directory)
  if (currentSize <= maxSizeMb)
    return 0

  let removed = 0
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    const withStats = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(directory, entry.name)
        try {
          const stats = await stat(fullPath)
          return { fullPath, mtimeMs: stats.mtimeMs, size: stats.size }
        }
        catch {
          return null
        }
      }),
    )

    const sorted = withStats
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .sort((a, b) => a.mtimeMs - b.mtimeMs) // oldest first

    let freedBytes = 0
    const targetFreeBytes = (currentSize - maxSizeMb) * 1024 * 1024

    for (const entry of sorted) {
      if (freedBytes >= targetFreeBytes)
        break
      try {
        await rm(entry.fullPath, { recursive: true, force: true })
        freedBytes += entry.size
        removed++
      }
      catch {
        // skip
      }
    }
  }
  catch {
    // directory may not exist
  }

  return removed
}

export async function pruneWithPolicy(directory: string, policy: RetentionPolicy): Promise<{ byAge: number, bySize: number }> {
  const byAge = await pruneByAge(directory, policy.maxAgeDays)
  const bySize = await pruneBySize(directory, policy.maxSizeMb)
  return { byAge, bySize }
}

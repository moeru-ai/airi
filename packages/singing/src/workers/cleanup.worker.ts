import { readdir, rm, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Worker for cleaning up old job artifacts, uploads, and temporary files.
 *
 * Cleans two directories under artifactBaseDir:
 *   jobs/     — completed/failed job artifacts older than maxAgeMs
 *   uploads/  — orphaned upload files older than uploadMaxAgeMs (1 hour default)
 */
export interface CleanupWorker {
  run: () => Promise<{ deletedJobs: number, deletedUploads: number, freedBytes: number }>
  stop: () => Promise<void>
}

const DEFAULT_JOB_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_UPLOAD_MAX_AGE_MS = 60 * 60 * 1000

/**
 * Create a cleanup worker instance.
 */
export function createCleanupWorker(
  artifactBaseDir: string,
  maxAgeMs: number = DEFAULT_JOB_MAX_AGE_MS,
): CleanupWorker {
  let stopped = false

  return {
    async run() {
      let deletedJobs = 0
      let deletedUploads = 0
      let freedBytes = 0
      const now = Date.now()

      const jobsDir = join(artifactBaseDir, 'jobs')
      try {
        const entries = await readdir(jobsDir)
        for (const entry of entries) {
          if (stopped)
            break
          const jobPath = join(jobsDir, entry)
          try {
            const s = await stat(jobPath)
            if (s.isDirectory() && (now - s.mtimeMs) > maxAgeMs) {
              freedBytes += await getDirSize(jobPath)
              await rm(jobPath, { recursive: true, force: true })
              deletedJobs++
            }
          }
          catch { /* skip inaccessible entries */ }
        }
      }
      catch { /* jobs directory may not exist yet */ }

      const uploadsDir = join(artifactBaseDir, 'uploads')
      try {
        const entries = await readdir(uploadsDir)
        for (const entry of entries) {
          if (stopped)
            break
          const filePath = join(uploadsDir, entry)
          try {
            const s = await stat(filePath)
            if (s.isFile() && (now - s.mtimeMs) > DEFAULT_UPLOAD_MAX_AGE_MS) {
              freedBytes += s.size
              await unlink(filePath)
              deletedUploads++
            }
          }
          catch { /* skip inaccessible entries */ }
        }
      }
      catch { /* uploads directory may not exist yet */ }

      return { deletedJobs, deletedUploads, freedBytes }
    },

    async stop() {
      stopped = true
    },
  }
}

async function getDirSize(dirPath: string): Promise<number> {
  let total = 0
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        total += await getDirSize(fullPath)
      }
      else {
        const s = await stat(fullPath)
        total += s.size
      }
    }
  }
  catch { /* ignore */ }
  return total
}

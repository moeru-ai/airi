import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Create a temporary directory for a job stage.
 */
export async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `airi-singing-${prefix}-`))
}

/**
 * Clean up a temporary directory and all its contents.
 */
export async function cleanupTempDir(dirPath: string): Promise<void> {
  await rm(dirPath, { recursive: true, force: true })
}

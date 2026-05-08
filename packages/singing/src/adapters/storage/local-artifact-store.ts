import type { Buffer } from 'node:buffer'

import type { ArtifactStore } from './artifact-store.interface'

import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

/**
 * Local filesystem implementation of ArtifactStore.
 * Stores artifacts under a configurable base directory.
 */
export class LocalArtifactStore implements ArtifactStore {
  constructor(private readonly baseDir: string) {}

  private resolvePath(jobId: string, relativePath: string): string {
    return join(this.baseDir, 'jobs', jobId, relativePath)
  }

  async write(jobId: string, relativePath: string, data: Buffer | Uint8Array): Promise<string> {
    const fullPath = this.resolvePath(jobId, relativePath)
    await mkdir(dirname(fullPath), { recursive: true })
    await writeFile(fullPath, data)
    return fullPath
  }

  async read(jobId: string, relativePath: string): Promise<Buffer> {
    const fullPath = this.resolvePath(jobId, relativePath)
    return readFile(fullPath)
  }

  async exists(jobId: string, relativePath: string): Promise<boolean> {
    try {
      await stat(this.resolvePath(jobId, relativePath))
      return true
    }
    catch {
      return false
    }
  }

  async getUrl(jobId: string, relativePath: string): Promise<string> {
    return `/api/v1/singing/artifacts/${jobId}/${relativePath}`
  }

  async deleteJob(jobId: string): Promise<void> {
    const jobDir = join(this.baseDir, 'jobs', jobId)
    await rm(jobDir, { recursive: true, force: true })
  }
}

import type { Buffer } from 'node:buffer'

/**
 * Interface for storing and retrieving pipeline artifacts.
 */
export interface ArtifactStore {
  /** Write a file to the store */
  write: (jobId: string, relativePath: string, data: Buffer | Uint8Array) => Promise<string>
  /** Read a file from the store */
  read: (jobId: string, relativePath: string) => Promise<Buffer>
  /** Check if a file exists */
  exists: (jobId: string, relativePath: string) => Promise<boolean>
  /** Get a URL for accessing an artifact */
  getUrl: (jobId: string, relativePath: string) => Promise<string>
  /** Delete all artifacts for a job */
  deleteJob: (jobId: string) => Promise<void>
}

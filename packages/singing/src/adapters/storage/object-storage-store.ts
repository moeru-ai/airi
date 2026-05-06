import type { Buffer } from 'node:buffer'

import type { ArtifactStore } from './artifact-store.interface'

import { SingingError, SingingErrorCode } from '../../contracts/error'

/**
 * Object storage (S3-compatible) implementation of ArtifactStore.
 * Reserved for cloud deployment scenarios.
 */
export class ObjectStorageStore implements ArtifactStore {
  private fail(): never {
    throw new SingingError(
      SingingErrorCode.StorageError,
      'Object storage backend is not yet configured. Use LocalArtifactStore for local development.',
    )
  }

  async write(_jobId: string, _relativePath: string, _data: Buffer | Uint8Array): Promise<string> {
    this.fail()
  }

  async read(_jobId: string, _relativePath: string): Promise<Buffer> {
    this.fail()
  }

  async exists(_jobId: string, _relativePath: string): Promise<boolean> {
    this.fail()
  }

  async getUrl(_jobId: string, _relativePath: string): Promise<string> {
    this.fail()
  }

  async deleteJob(_jobId: string): Promise<void> {
    this.fail()
  }
}

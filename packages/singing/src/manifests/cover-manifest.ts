import type { CoverManifest } from '../types/manifest'

/**
 * Create a blank cover manifest template for a new job.
 */
export function createCoverManifestTemplate(jobId: string): Partial<CoverManifest> {
  return {
    version: 1,
    jobId,
    createdAt: new Date().toISOString(),
    timing: {},
  }
}

/**
 * Serialize a cover manifest to JSON string.
 */
export function serializeCoverManifest(manifest: CoverManifest): string {
  return JSON.stringify(manifest, null, 2)
}

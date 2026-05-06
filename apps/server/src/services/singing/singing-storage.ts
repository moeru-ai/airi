import { join } from 'node:path'

/**
 * [singing] Artifact storage wrapper for the singing module.
 * Manages file paths and URLs for pipeline artifacts.
 */
export interface SingingStorage {
  readonly baseDir: string
  getArtifactDir: (jobId: string) => string
  getArtifactUrl: (jobId: string, relativePath: string) => string
}

/**
 * [singing] Create a local filesystem singing storage.
 * @param baseDir - The root temp directory from resolveRuntimeEnv().tempDir
 */
export function createSingingStorage(baseDir: string): SingingStorage {
  return {
    baseDir,
    getArtifactDir(jobId) {
      return join(baseDir, 'jobs', jobId)
    },
    getArtifactUrl(jobId, relativePath) {
      return `/api/v1/singing/artifacts/${jobId}/${relativePath}`
    },
  }
}

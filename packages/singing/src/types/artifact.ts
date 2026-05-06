/**
 * Represents a file artifact produced by a pipeline stage.
 */
export interface Artifact {
  /** Relative path within the job's output directory */
  readonly path: string
  /** MIME type of the artifact */
  readonly mimeType: string
  /** File size in bytes (populated after write) */
  size?: number
  /** SHA-256 hash for integrity verification */
  hash?: string
}

/**
 * Standard artifact names produced by the cover pipeline.
 */
export interface CoverArtifacts {
  source: Artifact
  vocals: Artifact
  instrumental: Artifact
  f0: Artifact
  convertedVocals: Artifact
  finalCover: Artifact
  manifest: Artifact
}

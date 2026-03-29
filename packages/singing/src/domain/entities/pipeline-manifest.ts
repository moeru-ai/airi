import type { CoverManifest } from '../../types/manifest'

/**
 * Domain entity wrapping the persisted manifest.
 * Provides methods for manifest construction during pipeline execution.
 */
export interface PipelineManifestEntity {
  readonly jobId: string
  data: Partial<CoverManifest>
  /** Mark a stage as completed with its timing */
  recordStageTiming: (stage: string, durationMs: number) => void
  /** Build the final manifest object */
  finalize: () => CoverManifest
}

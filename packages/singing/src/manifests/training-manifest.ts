/**
 * Training manifest: tracks a voice training job's configuration and results.
 */
export interface TrainingManifest {
  version: 1
  jobId: string
  voiceId: string
  createdAt: string
  completedAt?: string
  config: {
    epochs: number
    batchSize: number
    sampleRate: number
    datasetDurationSec: number
  }
  result?: {
    modelPath: string
    indexPath?: string
    finalLoss?: number
  }
}

/**
 * Create a blank training manifest template.
 */
export function createTrainingManifestTemplate(
  jobId: string,
  voiceId: string,
): Partial<TrainingManifest> {
  return {
    version: 1,
    jobId,
    voiceId,
    createdAt: new Date().toISOString(),
  }
}

/**
 * Default training preset for RVC voice model training.
 * Based on RVC official recommendations (>=10min clean speech).
 */
export const TRAINING_PRESET_DEFAULT = {
  epochs: 200,
  batchSize: 8,
  sampleRate: 40000,
  f0Method: 'rmvpe' as const,
  /** Minimum recommended dataset duration in seconds */
  minDatasetDurationSec: 600,
}

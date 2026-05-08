/**
 * Domain entity for an audio file managed by the pipeline.
 */
export interface AudioAsset {
  readonly path: string
  sampleRate: number
  channels: number
  durationSeconds: number
  format: string
}

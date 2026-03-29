/**
 * FFmpeg amix filter builder for merging vocals and accompaniment.
 */
export interface AmixOptions {
  inputs?: number
  /** Weights as space-separated string, e.g. '1 0.4' */
  weights?: string
  normalize?: boolean
}

/**
 * Build FFmpeg filter args for audio mixing.
 */
export function buildAmixFilter(options: AmixOptions = {}): string {
  const inputs = options.inputs ?? 2
  const weights = options.weights ?? '1 1'
  const norm = options.normalize ? 1 : 0
  return `amix=inputs=${inputs}:weights='${weights}':normalize=${norm}`
}

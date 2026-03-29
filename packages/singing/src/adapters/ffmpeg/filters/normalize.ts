/**
 * FFmpeg loudnorm filter builder.
 * Supports both single-pass and two-pass normalization.
 */
export interface LoudnormOptions {
  targetLufs?: number
  lra?: number
  truePeakDb?: number
}

/**
 * Build FFmpeg filter args for loudness normalization.
 */
export function buildLoudnormFilter(options: LoudnormOptions = {}): string {
  const i = options.targetLufs ?? -14
  const lra = options.lra ?? 11
  const tp = options.truePeakDb ?? -1.5
  return `loudnorm=I=${i}:LRA=${lra}:TP=${tp}`
}

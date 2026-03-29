/**
 * Value object for loudness measurements (LUFS / dBTP).
 */
export interface Loudness {
  /** Integrated loudness in LUFS */
  readonly integratedLufs: number
  /** True peak in dBTP */
  readonly truePeakDb: number
}

export function createLoudness(lufs: number, truePeak: number): Loudness {
  return { integratedLufs: lufs, truePeakDb: truePeak }
}

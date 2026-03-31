/**
 * Standard artifact layout within a job directory.
 *
 * <jobDir>/
 *   01_prep/source.wav
 *   02_separate/vocals.wav, instrumental.wav
 *   02b_isolate/lead_vocals.wav, backing_vocals.wav
 *   03_pitch/f0.npy
 *   04_convert/converted_vocals.wav
 *   05_mix/final_cover.wav
 *   manifest.json
 */

/** Standard artifact filenames */
export const ARTIFACT_NAMES = {
  source: 'source.wav',
  vocals: 'vocals.wav',
  instrumental: 'instrumental.wav',
  leadVocals: 'lead_vocals.wav',
  backingVocals: 'backing_vocals.wav',
  f0: 'f0.npy',
  f0Json: 'f0.json',
  convertedVocals: 'converted_vocals.wav',
  finalCover: 'final_cover.wav',
  manifest: 'manifest.json',
} as const

/** Stage subdirectory names */
export const STAGE_DIRS = {
  prep: '01_prep',
  separate: '02_separate',
  isolate: '02b_isolate',
  pitch: '03_pitch',
  convert: '04_convert',
  mix: '05_mix',
} as const

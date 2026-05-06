/**
 * [singing] Configuration for the singing module.
 * Environment variables and defaults specific to voice conversion.
 */
export interface SingingConfig {
  /** Base directory for job artifacts */
  artifactBaseDir: string
  /** Maximum concurrent singing jobs */
  maxConcurrentJobs: number
  /** Python worker binary path */
  pythonPath: string
  /** FFmpeg binary path */
  ffmpegPath: string
}

/**
 * [singing] Default singing configuration.
 */
export const DEFAULT_SINGING_CONFIG: SingingConfig = {
  artifactBaseDir: '/tmp/airi-singing',
  maxConcurrentJobs: 2,
  pythonPath: 'python',
  ffmpegPath: 'ffmpeg',
}

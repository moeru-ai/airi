/**
 * Named preset identifiers for common pipeline configurations.
 */
export enum PresetId {
  /** Default quality: MelBand + RMVPE + RVC */
  Default = 'default',
  /** Clean vocals: optimized for low-noise input */
  Clean = 'clean',
  /** Anime/ACG: tuned for anime-style vocals */
  Anime = 'anime',
  /** Low latency: trades quality for speed */
  LowLatency = 'low_latency',
}

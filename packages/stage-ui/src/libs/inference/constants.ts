/**
 * Centralized constants for the inference pipeline.
 *
 * Model IDs, timeout values, and retry parameters shared across
 * all adapters and workers.
 */

// ---------------------------------------------------------------------------
// Model IDs
// ---------------------------------------------------------------------------

/** HuggingFace model repository identifiers */
export const MODEL_IDS = {
  KOKORO: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  WHISPER: 'onnx-community/whisper-large-v3-turbo',
  BG_REMOVAL: 'Xenova/modnet',
} as const

/** Short model identifiers used in adapter state tracking and logging */
export const MODEL_NAMES = {
  KOKORO: 'kokoro-82m',
  WHISPER: 'whisper-large-v3-turbo',
  BG_REMOVAL: 'modnet',
} as const

// ---------------------------------------------------------------------------
// Timeouts (ms)
// ---------------------------------------------------------------------------

export const TIMEOUTS = {
  /** Kokoro model load timeout */
  KOKORO_LOAD: 120_000,
  /** Kokoro audio generation timeout */
  KOKORO_GENERATE: 120_000,

  /** Whisper model load timeout (larger model, allow more time) */
  WHISPER_LOAD: 180_000,
  /** Whisper transcription timeout */
  WHISPER_TRANSCRIBE: 120_000,

  /** Background removal model load timeout */
  BG_REMOVAL_LOAD: 120_000,
  /** Background removal per-image processing timeout */
  BG_REMOVAL_PROCESS: 60_000,
} as const

// ---------------------------------------------------------------------------
// Restart / Retry
// ---------------------------------------------------------------------------

/** Maximum number of automatic worker restarts before giving up */
export const MAX_RESTARTS = 3

/** Base delay in ms between restart attempts (multiplied by attempt number) */
export const RESTART_DELAY_MS = 1_000

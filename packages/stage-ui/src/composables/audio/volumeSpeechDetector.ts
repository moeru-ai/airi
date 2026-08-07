/**
 * Optional speech edge callbacks for {@link createVolumeSpeechDetector}.
 *
 * Callers typically wire these to the same transcription start/stop handlers
 * used by Silero VAD so volume fallback stays behavior-compatible.
 */
export interface VolumeSpeechDetectorHooks {
  /** Fired once when sustained loud frames cross into speech. */
  onSpeechStart?: () => void
  /** Fired once after sustained silence ends an active speech segment. */
  onSpeechEnd?: () => void
}

/**
 * One microphone-volume sample for {@link VolumeSpeechDetector.sample}.
 *
 * Levels use the analyzer's 0–100 scale. Thresholds are compared directly
 * against that scale (not Silero's 0–1 speech probability).
 */
export interface VolumeSpeechSampleInput {
  /** Current microphone volume level on a 0–100 scale. */
  level: number
  /**
   * Volume level (0–100) that must be sustained to enter speech.
   */
  startThreshold: number
  /**
   * Volume level (0–100) below which silence starts counting toward speech end.
   *
   * @default Math.max(1, startThreshold * 0.6)
   */
  stopThreshold?: number
  /**
   * Consecutive above-threshold frames required before emitting speech start.
   *
   * @default 4
   */
  startFrames?: number
  /**
   * Silence duration required before emitting speech end.
   *
   * @default 800
   */
  stopDelayMs?: number
  /**
   * Sample timestamp in milliseconds.
   *
   * @default Date.now()
   */
  now?: number
}

const DEFAULT_START_FRAMES = 4
const DEFAULT_STOP_DELAY_MS = 800

/**
 * Edge-triggered speech detector driven by microphone volume samples.
 *
 * Used when the Silero VAD model is unavailable or when the user explicitly
 * chooses volume-based monitoring. Rising edges emit `onSpeechStart`; falling
 * edges (after sustained silence) emit `onSpeechEnd`.
 */
export function createVolumeSpeechDetector(hooks: VolumeSpeechDetectorHooks = {}) {
  let isSpeaking = false
  let speechFrames = 0
  let lastSpeechAt = 0

  function reset() {
    isSpeaking = false
    speechFrames = 0
    lastSpeechAt = 0
  }

  function sample(input: VolumeSpeechSampleInput) {
    const now = input.now ?? Date.now()
    const startThreshold = input.startThreshold
    const stopThreshold = input.stopThreshold ?? Math.max(1, startThreshold * 0.6)
    const startFrames = input.startFrames ?? DEFAULT_START_FRAMES
    const stopDelayMs = input.stopDelayMs ?? DEFAULT_STOP_DELAY_MS
    const level = input.level

    if (!isSpeaking) {
      if (level >= startThreshold) {
        speechFrames += 1
        if (speechFrames >= startFrames) {
          isSpeaking = true
          speechFrames = 0
          lastSpeechAt = now
          hooks.onSpeechStart?.()
        }
      }
      else {
        speechFrames = 0
      }

      return isSpeaking
    }

    if (level > stopThreshold) {
      lastSpeechAt = now
      return isSpeaking
    }

    if (!lastSpeechAt)
      lastSpeechAt = now

    if (now - lastSpeechAt >= stopDelayMs) {
      isSpeaking = false
      speechFrames = 0
      lastSpeechAt = 0
      hooks.onSpeechEnd?.()
    }

    return isSpeaking
  }

  return {
    sample,
    reset,
    get isSpeaking() {
      return isSpeaking
    },
  }
}

export type VolumeSpeechDetector = ReturnType<typeof createVolumeSpeechDetector>

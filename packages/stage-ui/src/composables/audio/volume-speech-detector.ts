export interface VolumeSpeechDetectorHooks {
  onSpeechStart?: () => void
  onSpeechEnd?: () => void
}

export interface VolumeSpeechSampleInput {
  level: number
  /**
   * Volume level (0-100) that must be sustained to enter speech.
   */
  startThreshold: number
  /**
   * Volume level (0-100) below which silence starts counting toward speech end.
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

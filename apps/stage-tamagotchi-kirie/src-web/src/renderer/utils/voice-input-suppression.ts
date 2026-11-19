export const DEFAULT_ASSISTANT_SPEECH_INPUT_COOLDOWN_MS = 800

export interface VoiceInputSuppressionOptions {
  assistantSpeaking: boolean
  suppressedUntil: number
}

/**
 * Decides whether voice input should be ignored while assistant audio can leak into the microphone.
 *
 * Use when:
 * - The assistant is actively playing TTS.
 * - The assistant just stopped speaking and speaker echo may still be captured.
 *
 * Expects:
 * - `suppressedUntil` is a timestamp in milliseconds.
 *
 * Returns:
 * - `true` when capture, transcription, and ingestion should be skipped.
 */
export function shouldSuppressVoiceInput(options: VoiceInputSuppressionOptions, now = Date.now()) {
  return options.assistantSpeaking || now < options.suppressedUntil
}

/**
 * Calculates the timestamp until which voice input should stay muted after assistant speech.
 *
 * Use when:
 * - Assistant playback has ended and the microphone may still receive speaker tail audio.
 *
 * Expects:
 * - `endedAt` is the playback end timestamp in milliseconds.
 *
 * Returns:
 * - A timestamp in milliseconds after the configured cooldown.
 */
export function assistantSpeechCooldownDeadline(
  endedAt = Date.now(),
  cooldownMs = DEFAULT_ASSISTANT_SPEECH_INPUT_COOLDOWN_MS,
) {
  return endedAt + cooldownMs
}

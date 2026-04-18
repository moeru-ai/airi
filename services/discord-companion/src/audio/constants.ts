/**
 * Decoded PCM sample rate used when feeding Opus packets through {@link OpusDecoder}.
 *
 * Use when:
 * - Normalising Discord voice packets (Opus) into 16-bit PCM suitable for WAV wrapping.
 *
 * @default 16000
 *
 * NOTICE:
 * Matches the rate expected by Whisper-family models and keeps downstream WAV wrappers simple.
 */
export const DECODE_SAMPLE_RATE = 16000

/**
 * Mono channel count for decoded PCM.
 *
 * @default 1
 */
export const DECODE_CHANNELS = 1

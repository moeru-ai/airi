const AUDIO_MIME_TYPES: Record<string, string> = {
  flac: 'audio/flac',
  mp3: 'audio/mpeg',
  ogg_opus: 'audio/ogg',
  opus: 'audio/opus',
  pcm: 'audio/L16',
  wav: 'audio/wav',
}

/**
 * Maps provider audio format keys to response MIME types.
 *
 * Use when:
 * - A TTS adapter forwards OpenAI-shaped `response_format` / provider
 *   encoding keys through unspeech and needs a gateway fallback MIME type.
 *
 * Expects:
 * - `format` is the exact provider/OpenAI format key.
 *
 * Returns:
 * - A known audio MIME type, or `application/octet-stream` for unknown custom
 *   formats so operators can still experiment through config.
 */
export function audioMimeFromFormat(format: string): string {
  return AUDIO_MIME_TYPES[format] ?? 'application/octet-stream'
}

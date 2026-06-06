/**
 * Business trigger hint sent to server-side product analytics.
 *
 * - `auto`: TTS was triggered automatically by the chat pipeline.
 * - `manual`: TTS was triggered explicitly by the user.
 */
export type TtsTrigger = 'auto' | 'manual'

/**
 * Low-cardinality source hint sent to server-side product analytics.
 *
 * - `chat_auto_tts`: Automatic TTS from chat message flow.
 * - `manual_preview`: User previewed a voice from settings/test UI.
 * - `settings_test`: User tested TTS from provider settings page.
 */
export type TtsSource = 'chat_auto_tts' | 'manual_preview' | 'settings_test'

/**
 * Converts an HTTP base URL into a WebSocket URL with TTS analytics query
 * parameters. Shared between streaming-pipeline and streaming-session so that
 * future query-parameter changes only need to be made in one place.
 */
export function buildStreamingTtsUrl(
  httpBase: string,
  path: string,
  token: string,
  analytics: { ttsTrigger: TtsTrigger, ttsSource: TtsSource },
): string {
  const u = new URL(path, httpBase)
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:'
  u.searchParams.set('token', token)
  u.searchParams.set('tts_trigger', analytics.ttsTrigger)
  u.searchParams.set('tts_source', analytics.ttsSource)
  return u.toString()
}

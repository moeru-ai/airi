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

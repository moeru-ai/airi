/** Minimal model shape accepted by streaming TTS visibility policy. */
export interface StreamingTtsModelSelection {
  id: string
}

/**
 * Decides whether an unSpeech streaming model can be selected.
 *
 * An empty curated list intentionally delegates filtering to unSpeech. A
 * non-empty list is an operator allowlist. Catalog and websocket resolution
 * must share this rule so visible models are always startable.
 */
export function isUnspeechStreamingModelEnabled(
  models: StreamingTtsModelSelection[],
  requestedModel: string,
): boolean {
  return models.length === 0 || models.some(model => model.id === requestedModel)
}

/**
 * Converts a canonical public model id into the resource id expected by
 * unSpeech's upstream voice catalog.
 *
 * Before: `volcengine/seed-tts-2.0`
 * After: `seed-tts-2.0`
 */
export function streamingTtsModelResourceId(model: string): string {
  const separator = model.indexOf('/')
  return separator >= 0 ? model.slice(separator + 1) : model
}

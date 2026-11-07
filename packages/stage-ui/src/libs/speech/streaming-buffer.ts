/**
 * Streaming models whose sentence and subtitle frames arrive on a separate
 * track from the audio bytes and carry no offsets. The client cannot cut the
 * audio at a sentence boundary without dropping frames, so these sessions
 * buffer the whole turn. They also cannot align translation captions to
 * playback, so bilingual translation subtitles are unsupported for them.
 */
const BUFFERED_STREAMING_RESOURCE_PREFIXES = ['seed-tts-2.0', 'seed-icl-2.0']

/** Whether one streaming resource id requires whole-session buffering. */
export function isBufferedStreamingResourceId(resourceId: string): boolean {
  return BUFFERED_STREAMING_RESOURCE_PREFIXES.some(prefix => resourceId.startsWith(prefix))
}

/**
 * Resolves the `provider/resourceId` model string for a streaming session.
 * An active value without the provider prefix is an HTTP `auto` alias; the
 * provider-curated default replaces it. Returns undefined when neither is
 * usable.
 */
export function resolveStreamingSessionModel(activeModel: string | null | undefined, defaultModel: string | null | undefined): string | undefined {
  const model = activeModel?.includes('/')
    ? activeModel
    : defaultModel
  return model?.includes('/') ? model : undefined
}

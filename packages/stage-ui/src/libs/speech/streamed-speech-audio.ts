import type { SpeechAudioData } from '@proj-airi/core-agent'

import { streamSource } from '@proj-airi/audio/encoding'
import { InvalidResponseError, postJSON } from '@xsai/shared'

type SpeechRequestOptions = Parameters<typeof postJSON>[1] & {
  input: string
  voice: string
  model: string
}

/** Content types of WAV. Some providers stream WAV, and mediabunny decodes it while it arrives. */
const WAV_CONTENT_TYPES = new Set(['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/vnd.wave'])

/**
 * Requests speech as WAV and returns it as soon as the first bytes arrive.
 *
 * Use when:
 * - The server streams the audio body, as the official AIRI speech provider does.
 *
 * Expects:
 * - `options` is an xsAI speech request, for example the result of `provider.speech(model, settings)` with
 *   `input`, `voice`, and `abortSignal`.
 *
 * Returns:
 * - A PCM stream when the server answers with WAV. Playback starts on its first block.
 * - A `Blob` with the whole body for any other content type, so the browser decodes it as before.
 * - `null` when the server sends no audio, for example HTTP 204 for an automatic request without balance.
 */
export async function requestStreamedSpeechAudio(options: SpeechRequestOptions): Promise<SpeechAudioData | null> {
  let response: Response
  try {
    response = await postJSON('audio/speech', { ...options, responseFormat: 'wav' })
  }
  catch (error) {
    // The server answers 204 without a body when an automatic request has no balance. That is no audio, not a failure.
    if (error instanceof InvalidResponseError && error.reason === 'empty_body' && error.response?.status === 204)
      return null
    throw error
  }
  if (!response.body)
    return null

  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
  if (!WAV_CONTENT_TYPES.has(contentType))
    return await response.blob()

  return streamSource(response.body).open(options.abortSignal ?? new AbortController().signal)
}

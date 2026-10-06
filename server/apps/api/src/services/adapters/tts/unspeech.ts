import type { Voice } from 'unspeech'

import type { TtsVoiceCatalogContext } from './types'

import { errorMessageFrom } from '@moeru/std'
import { listVoices, UnSpeechAPIError } from 'unspeech'

import { createBadGatewayError } from '../../../utils/error'

interface ListVoicesOptions {
  ctx: TtsVoiceCatalogContext
  query: string
  providerLabel: string
}

/**
 * Lists unspeech voices and maps SDK failures into AIRI gateway errors.
 *
 * Use when:
 * - A TTS adapter needs unspeech's normalized `Voice[]` catalog.
 *
 * Expects:
 * - `query` is an unspeech `/api/voices` query string such as
 *   `provider=microsoft&region=eastasia`.
 *
 * Returns:
 * - The parsed voice catalog.
 */
export async function listVoicesViaUnSpeech(options: ListVoicesOptions): Promise<Voice[]> {
  const { ctx, providerLabel, query } = options

  try {
    return await listVoices({
      baseURL: ctx.unspeechBaseURL.replace(/\/+$/, ''),
      fetch: ctx.fetchImpl,
      query,
      abortSignal: ctx.abortSignal,
      headers: { Accept: 'application/json' },
    })
  }
  catch (error) {
    if (error instanceof UnSpeechAPIError) {
      throw createBadGatewayError(
        `${providerLabel} voices upstream ${error.status}: ${error.responseBody.slice(0, 256)}`,
        { lastStatusCode: error.status },
      )
    }

    throw createBadGatewayError(`${providerLabel} voices fetch failed: ${errorMessageFrom(error) ?? 'unknown'}`)
  }
}

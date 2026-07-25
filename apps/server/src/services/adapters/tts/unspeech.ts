import type { Voice } from 'unspeech'

import type { TtsAdapterContext, TtsResult, TtsVoiceCatalogContext } from './types'

import { errorMessageFrom } from '@moeru/std'
import { generateSpeechResponse, listVoices, UnSpeechAPIError } from 'unspeech'

import { createBadGatewayError, createInternalError } from '../../../utils/error'

interface SendSpeechOptions {
  ctx: TtsAdapterContext
  model: string
  input: string
  voice: string
  speed?: number
  responseFormat: string
  extraBody?: Record<string, unknown>
  fallbackContentType: string
  providerLabel: string
}

/**
 * Sends one OpenAI-shaped speech request through the unspeech SDK.
 *
 * Use when:
 * - A TTS adapter has resolved AIRI's provider policy and needs to delegate the
 *   actual HTTP request to unspeech.
 *
 * Expects:
 * - `model`, `voice`, `responseFormat`, and `extraBody` already match the
 *   provider-specific unspeech contract.
 *
 * Returns:
 * - The binary audio payload plus a content type for the OpenAI route.
 */
export async function sendSpeechViaUnSpeech(options: SendSpeechOptions): Promise<TtsResult> {
  const {
    ctx,
    extraBody,
    fallbackContentType,
    input,
    model,
    providerLabel,
    responseFormat,
    speed,
    voice,
  } = options

  try {
    const result = await generateSpeechResponse({
      apiKey: ctx.keyPlaintext.toString('utf8'),
      baseURL: `${ctx.unspeechBaseURL.replace(/\/+$/, '')}/v1/`,
      fetch: ctx.fetchImpl,
      input,
      model,
      responseFormat,
      speed,
      voice,
      abortSignal: ctx.abortSignal,
      extraBody,
    })

    return {
      contentType: result.contentType ?? fallbackContentType,
      body: result.body,
    }
  }
  catch (error) {
    if (error instanceof UnSpeechAPIError) {
      const err = new Error(`${providerLabel} tts upstream ${error.status}: ${error.responseBody.slice(0, 256)}`) as Error & { status?: number }
      err.status = error.status
      throw err
    }

    throw createInternalError(`${providerLabel} tts fetch failed: ${errorMessageFrom(error) ?? 'unknown'}`)
  }
}

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
      apiKey: ctx.keyPlaintext?.toString('utf8'),
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

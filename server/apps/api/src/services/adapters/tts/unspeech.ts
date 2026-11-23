import type { Voice } from 'unspeech'

import type { TtsAdapterContext, TtsResult, TtsVoiceCatalogContext } from './types'

import { errorMessageFrom } from '@moeru/std'
import { createBadGatewayError, createInternalError } from '@proj-airi/http-shared'
import { listVoices, UnSpeechAPIError } from 'unspeech'

import { TtsUpstreamResponseError } from './types'

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
 * Sends one OpenAI-shaped speech request to unspeech and returns the audio as a stream.
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
 * - The upstream audio body as a stream, plus a content type. The caller sends the
 *   first bytes to the client as soon as unspeech sends them.
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

  // NOTICE:
  // The unspeech SDK `generateSpeechResponse` reads the whole body with `arrayBuffer()`, so the client got no audio
  // until synthesis finished. This fetch sends the same JSON body and keeps the body as a stream.
  // Source: node_modules/unspeech/dist/index.mjs `generateSpeechResponse` (unspeech@0.1.16).
  // Removal condition: the unspeech SDK returns the response body as a stream.
  const requestBody = JSON.stringify({
    model,
    input,
    voice,
    speed,
    response_format: responseFormat,
    extra_body: extraBody,
  })

  let response: Response
  try {
    response = await ctx.fetchImpl(`${ctx.unspeechBaseURL.replace(/\/+$/, '')}/v1/audio/speech`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ctx.keyPlaintext.toString('utf8')}`,
        'Content-Type': 'application/json',
      },
      body: requestBody,
      signal: ctx.abortSignal,
    })
  }
  catch (error) {
    // Keep abort identity intact so the router can apply `onTimeout`
    // independently from HTTP 500 fallback policy.
    if (ctx.abortSignal?.aborted)
      throw error

    throw createInternalError(`${providerLabel} tts fetch failed: ${errorMessageFrom(error) ?? 'unknown'}`)
  }

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '')
    throw new TtsUpstreamResponseError(new Response(responseBody, {
      status: response.status,
      headers: response.headers,
    }))
  }

  if (!response.body)
    throw createInternalError(`${providerLabel} tts response has no body`)

  return {
    contentType: response.headers.get('content-type') ?? fallbackContentType,
    body: response.body,
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

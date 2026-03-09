import type { Context } from 'hono'

import type { ConfigKVService } from '../services/config-kv'
import type { FluxService } from '../services/flux'
import type { RequestLogService } from '../services/request-log'
import type { HonoEnv } from '../types/hono'

import { useLogger } from '@guiiai/logg'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import { authGuard } from '../middlewares/auth'
import { configGuard } from '../middlewares/config-guard'
import { createPaymentRequiredError } from '../utils/error'

// Only forward these headers from the upstream LLM response
const SAFE_RESPONSE_HEADERS = new Set([
  'content-type',
  'content-length',
  'transfer-encoding',
  'cache-control',
])

function buildSafeResponseHeaders(response: Response): Headers {
  const headers = new Headers()
  for (const [key, value] of response.headers) {
    if (SAFE_RESPONSE_HEADERS.has(key.toLowerCase()))
      headers.set(key, value)
  }
  return headers
}

function normalizeBaseUrl(gatewayBaseUrl: string): string {
  return gatewayBaseUrl.endsWith('/') ? gatewayBaseUrl : `${gatewayBaseUrl}/`
}

export function createV1CompletionsRoutes(fluxService: FluxService, configKV: ConfigKVService, requestLogService: RequestLogService) {
  async function handleCompletion(c: Context<HonoEnv>) {
    const user = c.get('user')!
    const flux = await fluxService.getFlux(user.id)
    if (flux.flux <= 0) {
      throw createPaymentRequiredError('Insufficient flux')
    }

    const body = await c.req.json()

    const fluxPerRequest = await configKV.getOrThrow('FLUX_PER_REQUEST')
    await fluxService.consumeFlux(user.id, fluxPerRequest)

    const gatewayBaseUrl = await configKV.getOrThrow('GATEWAY_BASE_URL')
    const baseUrl = normalizeBaseUrl(gatewayBaseUrl)
    const requestModel = body.model || 'auto'
    const startedAt = Date.now()

    const response = await fetch(`${baseUrl}chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const durationMs = Date.now() - startedAt

    // Log the request asynchronously (don't block response)
    requestLogService.logRequest({
      userId: user.id,
      model: requestModel,
      status: response.status,
      durationMs,
      fluxConsumed: fluxPerRequest,
    }).catch((err) => {
      console.error('Failed to log request:', err)
    })

    // Refund flux for any failed request
    if (!response.ok) {
      await fluxService.addFlux(user.id, fluxPerRequest)
    }

    return new Response(response.body, {
      status: response.status,
      headers: buildSafeResponseHeaders(response),
    })
  }

  async function handleTTS(c: Context<HonoEnv>) {
    const user = c.get('user')!
    const flux = await fluxService.getFlux(user.id)
    if (flux.flux <= 0) {
      throw createPaymentRequiredError('Insufficient flux')
    }

    const body = await c.req.json()

    const fluxPerRequest = await configKV.getOrThrow('FLUX_PER_REQUEST_TTS')
    await fluxService.consumeFlux(user.id, fluxPerRequest)

    const gatewayBaseUrl = await configKV.getOrThrow('GATEWAY_BASE_URL')
    const baseUrl = normalizeBaseUrl(gatewayBaseUrl)
    const requestModel = body.model || 'auto'
    const startedAt = Date.now()

    const response = await fetch(`${baseUrl}audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const durationMs = Date.now() - startedAt

    requestLogService.logRequest({
      userId: user.id,
      model: requestModel,
      status: response.status,
      durationMs,
      fluxConsumed: fluxPerRequest,
    }).catch((err) => {
      useLogger().withError(err).error('Failed to log TTS request')
    })

    if (!response.ok) {
      await fluxService.addFlux(user.id, fluxPerRequest)
    }

    return new Response(response.body, {
      status: response.status,
      headers: buildSafeResponseHeaders(response),
    })
  }

  async function handleTranscription(c: Context<HonoEnv>) {
    const user = c.get('user')!
    const flux = await fluxService.getFlux(user.id)
    if (flux.flux <= 0) {
      throw createPaymentRequiredError('Insufficient flux')
    }

    const fluxPerRequest = await configKV.getOrThrow('FLUX_PER_REQUEST_ASR')
    await fluxService.consumeFlux(user.id, fluxPerRequest)

    const gatewayBaseUrl = await configKV.getOrThrow('GATEWAY_BASE_URL')
    const baseUrl = normalizeBaseUrl(gatewayBaseUrl)
    const startedAt = Date.now()

    // Forward the raw body with original content-type (multipart/form-data)
    const rawBody = await c.req.arrayBuffer()
    const contentType = c.req.header('content-type') || 'multipart/form-data'

    const response = await fetch(`${baseUrl}audio/transcriptions`, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
      },
      body: rawBody,
    })

    const durationMs = Date.now() - startedAt

    requestLogService.logRequest({
      userId: user.id,
      model: 'auto',
      status: response.status,
      durationMs,
      fluxConsumed: fluxPerRequest,
    }).catch((err) => {
      console.error('Failed to log ASR request:', err)
    })

    if (!response.ok) {
      await fluxService.addFlux(user.id, fluxPerRequest)
    }

    return new Response(response.body, {
      status: response.status,
      headers: buildSafeResponseHeaders(response),
    })
  }

  const chatGuard = configGuard(configKV, ['FLUX_PER_REQUEST', 'GATEWAY_BASE_URL'], 'Service is not available yet')
  const ttsGuard = configGuard(configKV, ['FLUX_PER_REQUEST_TTS', 'GATEWAY_BASE_URL'], 'TTS service is not available yet')
  const asrGuard = configGuard(configKV, ['FLUX_PER_REQUEST_ASR', 'GATEWAY_BASE_URL'], 'ASR service is not available yet')

  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .post('/chat/completions', chatGuard, handleCompletion)
    .post('/chat/completion', chatGuard, handleCompletion)
    .post('/audio/speech', ttsGuard, handleTTS)
    .post('/audio/transcriptions', bodyLimit({ maxSize: 25 * 1024 * 1024 }), asrGuard, handleTranscription)
}

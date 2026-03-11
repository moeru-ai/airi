import type { Context } from 'hono'

import type { ConfigKVService } from '../services/config-kv'
import type { FluxService } from '../services/flux'
import type { RequestLogService } from '../services/request-log'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import { authGuard } from '../middlewares/auth'
import { configGuard } from '../middlewares/config-guard'
import { createPaymentRequiredError } from '../utils/error'

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

interface UsageInfo {
  promptTokens?: number
  completionTokens?: number
}

function extractUsageFromBody(body: any): UsageInfo {
  const usage = body?.usage
  if (!usage)
    return {}
  return {
    promptTokens: usage.prompt_tokens ?? undefined,
    completionTokens: usage.completion_tokens ?? undefined,
  }
}

function calculateFluxFromUsage(usage: UsageInfo, fluxPer1kTokens: number, fallbackRate: number): number {
  const { promptTokens, completionTokens } = usage
  if (promptTokens != null && completionTokens != null) {
    const totalTokens = promptTokens + completionTokens
    return Math.max(1, Math.ceil(totalTokens / 1000 * fluxPer1kTokens))
  }
  return fallbackRate
}

export function createV1CompletionsRoutes(fluxService: FluxService, configKV: ConfigKVService, requestLogService: RequestLogService) {
  async function handleCompletion(c: Context<HonoEnv>) {
    const user = c.get('user')!
    const flux = await fluxService.getFlux(user.id)
    if (flux.flux <= 0) {
      throw createPaymentRequiredError('Insufficient flux')
    }

    const body = await c.req.json()
    const gatewayBaseUrl = await configKV.getOrThrow('GATEWAY_BASE_URL')
    const baseUrl = normalizeBaseUrl(gatewayBaseUrl)
    let requestModel = body.model || 'auto'

    if (requestModel === 'auto') {
      requestModel = await configKV.getOrThrow('DEFAULT_CHAT_MODEL')
    }

    const startedAt = Date.now()

    const response = await fetch(`${baseUrl}chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, model: requestModel }),
    })

    const durationMs = Date.now() - startedAt

    if (!response.ok) {
      return new Response(response.body, {
        status: response.status,
        headers: buildSafeResponseHeaders(response),
      })
    }

    // Post-billing: parse usage and charge after successful response
    const fallbackRate = await configKV.getOrThrow('FLUX_PER_REQUEST')
    const fluxPer1kTokens = (await configKV.getOptional('FLUX_PER_1K_TOKENS')) ?? 1

    if (body.stream) {
      // Streaming: return response immediately, bill after stream ends
      const { readable, writable } = new TransformStream()
      const reader = response.body!.getReader()
      const writer = writable.getWriter()
      // Buffer last 2KB to handle chunk boundary splits for usage extraction
      let tailBuffer = ''

      // Process stream in background
      ;(async () => {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done)
              break
            await writer.write(value)
            const text = new TextDecoder().decode(value)
            tailBuffer = (tailBuffer + text).slice(-2048)
          }
        }
        finally {
          await writer.close()

          // Extract usage from final SSE data lines
          let usage: UsageInfo = {}
          try {
            const lines = tailBuffer.split('\n').filter(l => l.startsWith('data: ') && !l.includes('[DONE]'))
            const lastDataLine = lines[lines.length - 1]
            if (lastDataLine) {
              const json = JSON.parse(lastDataLine.slice(6))
              usage = extractUsageFromBody(json)
            }
          }
          catch { /* fallback to flat rate */ }

          const fluxConsumed = calculateFluxFromUsage(usage, fluxPer1kTokens, fallbackRate)

          // Best-effort billing — don't throw on insufficient flux during streaming
          try {
            await fluxService.consumeFlux(user.id, fluxConsumed)
          }
          catch { /* already streaming, can't reject now */ }

          requestLogService.logRequest({
            userId: user.id,
            model: requestModel,
            status: response.status,
            durationMs,
            fluxConsumed,
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
          }).catch(() => {})
        }
      })()

      return new Response(readable, {
        status: response.status,
        headers: buildSafeResponseHeaders(response),
      })
    }

    // Non-streaming: parse response, bill, then return
    const responseBody = await response.json()
    const usage = extractUsageFromBody(responseBody)
    const fluxConsumed = calculateFluxFromUsage(usage, fluxPer1kTokens, fallbackRate)

    // Best-effort billing — gateway already processed the request,
    // don't return 402 after work is done
    try {
      await fluxService.consumeFlux(user.id, fluxConsumed)
    }
    catch { /* log will still capture the charge for write-back */ }

    requestLogService.logRequest({
      userId: user.id,
      model: requestModel,
      status: response.status,
      durationMs,
      fluxConsumed,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
    }).catch(() => {})

    return c.json(responseBody)
  }

  async function handleTTS(c: Context<HonoEnv>) {
    const user = c.get('user')!
    const flux = await fluxService.getFlux(user.id)
    if (flux.flux <= 0) {
      throw createPaymentRequiredError('Insufficient flux')
    }

    const body = await c.req.json()
    const gatewayBaseUrl = await configKV.getOrThrow('GATEWAY_BASE_URL')
    const baseUrl = normalizeBaseUrl(gatewayBaseUrl)
    const requestModel = body.model || 'auto'
    const startedAt = Date.now()

    const response = await fetch(`${baseUrl}audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const durationMs = Date.now() - startedAt

    if (!response.ok) {
      return new Response(response.body, {
        status: response.status,
        headers: buildSafeResponseHeaders(response),
      })
    }

    const fluxPerRequest = await configKV.getOrThrow('FLUX_PER_REQUEST_TTS')
    await fluxService.consumeFlux(user.id, fluxPerRequest)

    requestLogService.logRequest({
      userId: user.id,
      model: requestModel,
      status: response.status,
      durationMs,
      fluxConsumed: fluxPerRequest,
    }).catch(() => {})

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

    const gatewayBaseUrl = await configKV.getOrThrow('GATEWAY_BASE_URL')
    const baseUrl = normalizeBaseUrl(gatewayBaseUrl)
    const startedAt = Date.now()

    const rawBody = await c.req.arrayBuffer()
    const contentType = c.req.header('content-type') || 'multipart/form-data'

    const response = await fetch(`${baseUrl}audio/transcriptions`, {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: rawBody,
    })

    const durationMs = Date.now() - startedAt

    if (!response.ok) {
      return new Response(response.body, {
        status: response.status,
        headers: buildSafeResponseHeaders(response),
      })
    }

    const fluxPerRequest = await configKV.getOrThrow('FLUX_PER_REQUEST_ASR')
    await fluxService.consumeFlux(user.id, fluxPerRequest)

    requestLogService.logRequest({
      userId: user.id,
      model: 'auto',
      status: response.status,
      durationMs,
      fluxConsumed: fluxPerRequest,
    }).catch(() => {})

    return new Response(response.body, {
      status: response.status,
      headers: buildSafeResponseHeaders(response),
    })
  }

  const chatGuard = configGuard(configKV, ['FLUX_PER_REQUEST', 'GATEWAY_BASE_URL', 'DEFAULT_CHAT_MODEL'], 'Service is not available yet')
  const ttsGuard = configGuard(configKV, ['FLUX_PER_REQUEST_TTS', 'GATEWAY_BASE_URL'], 'TTS service is not available yet')
  const asrGuard = configGuard(configKV, ['FLUX_PER_REQUEST_ASR', 'GATEWAY_BASE_URL'], 'ASR service is not available yet')

  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .post('/chat/completions', chatGuard, handleCompletion)
    .post('/chat/completion', chatGuard, handleCompletion)
    .post('/audio/speech', ttsGuard, handleTTS)
    .post('/audio/transcriptions', bodyLimit({ maxSize: 25 * 1024 * 1024 }), asrGuard, handleTranscription)
}

import type { Context } from 'hono'

import type { ConfigKVService } from '../services/config-kv'
import type { FluxService } from '../services/flux'
import type { RequestLogService } from '../services/request-log'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'

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

    // Normalize: ensure trailing slash
    const baseUrl = gatewayBaseUrl.endsWith('/') ? gatewayBaseUrl : `${gatewayBaseUrl}/`

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
    }).catch(() => {})

    // Refund flux for any failed request
    if (!response.ok) {
      await fluxService.addFlux(user.id, fluxPerRequest)
    }

    const headers = new Headers()
    for (const [key, value] of response.headers) {
      if (SAFE_RESPONSE_HEADERS.has(key.toLowerCase()))
        headers.set(key, value)
    }

    return new Response(response.body, {
      status: response.status,
      headers,
    })
  }

  return new Hono<HonoEnv>()
    .use('*', authGuard, configGuard(configKV, ['FLUX_PER_REQUEST', 'GATEWAY_BASE_URL'], 'Service is not available yet'))
    .post('/chat/completions', handleCompletion)
    .post('/chat/completion', handleCompletion)
}

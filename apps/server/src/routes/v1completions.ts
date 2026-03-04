import type { Context } from 'hono'

import type { Env } from '../libs/env'
import type { ConfigKVService } from '../services/config-kv'
import type { FluxService } from '../services/flux'
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

export function createV1CompletionsRoutes(fluxService: FluxService, configKV: ConfigKVService, env: Env) {
  async function handleCompletion(c: Context<HonoEnv>) {
    const user = c.get('user')!
    const flux = await fluxService.getFlux(user.id)
    if (flux.flux <= 0) {
      throw createPaymentRequiredError('Insufficient flux')
    }

    const body = await c.req.json()

    const fluxPerRequest = await configKV.get('FLUX_PER_REQUEST')
    await fluxService.consumeFlux(user.id, fluxPerRequest)

    const response = await fetch(`${env.BACKEND_LLM_BASE_URL}chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.BACKEND_LLM_API_KEY}`,
      },
      body: JSON.stringify(body),
    })

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
    .use('*', authGuard, configGuard(configKV, ['FLUX_PER_REQUEST'], 'Service is not available yet'))
    .post('/chat/completions', handleCompletion)
    .post('/chat/completion', handleCompletion)
}

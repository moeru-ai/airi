import type { FluxService } from '../services/flux'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'

import { authGuard } from '../middlewares/auth'

export function createV1Routes(fluxService: FluxService, env: any) {
  const v1 = new Hono<HonoEnv>()

  v1.use('*', authGuard)

  async function handleCompletion(c: any) {
    const user = c.get('user')!
    const flux = await fluxService.getFlux(user.id)
    if (flux.flux <= 0) {
      return c.json({ error: 'Insufficient flux' }, 402)
    }

    const body = await c.req.json()

    // Consume flux (simplified: 1 per request)
    await fluxService.consumeFlux(user.id, 1)

    const response = await fetch(`${env.BACKEND_LLM_BASE_URL}chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.BACKEND_LLM_API_KEY}`,
      },
      body: JSON.stringify(body),
    })

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    })
  }

  v1.post('/chat/completions', handleCompletion)
  v1.post('/chat/completion', handleCompletion)

  return v1
}

import type { CreditsService } from '../services/credits'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'

import { authGuard } from '../middlewares/auth'

export function createV1Routes(creditsService: CreditsService, env: any) {
  const v1 = new Hono<HonoEnv>()

  v1.use('*', authGuard)

  async function handleCompletion(c: any) {
    const user = c.get('user')!
    const credits = await creditsService.getCredits(user.id)
    if (credits.credits <= 0) {
      return c.json({ error: 'Insufficient credits' }, 402)
    }

    const body = await c.req.json()

    // Consume credits (simplified: 1 per request)
    await creditsService.consumeCredits(user.id, 1)

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

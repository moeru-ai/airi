import type { CreditsService } from '../services/credits'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'

import { authGuard } from '../middlewares/auth'

export function createCreditsRoutes(creditsService: CreditsService) {
  const routes = new Hono<HonoEnv>()

  routes.use('*', authGuard)

  routes.get('/', async (c) => {
    const user = c.get('user')!
    const credits = await creditsService.getCredits(user.id)
    return c.json(credits)
  })

  return routes
}

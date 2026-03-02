import type { FluxService } from '../services/flux'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'

import { authGuard } from '../middlewares/auth'

export function createFluxRoutes(fluxService: FluxService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .get('/', async (c) => {
      const user = c.get('user')!
      const flux = await fluxService.getFlux(user.id)
      return c.json(flux)
    })
}

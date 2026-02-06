import type { FluxService } from '../services/flux'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'

import { authGuard } from '../middlewares/auth'

export function createFluxRoutes(fluxService: FluxService) {
  const routes = new Hono<HonoEnv>()

  routes.use('*', authGuard)

  routes.get('/', async (c) => {
    const user = c.get('user')!
    const flux = await fluxService.getFlux(user.id)
    return c.json(flux)
  })

  return routes
}

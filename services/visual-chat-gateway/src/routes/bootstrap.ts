import { createRouter, defineEventHandler } from 'h3'

import { createGatewayAccessToken, requireGatewayAccess } from '../auth'

export function createBootstrapRoutes() {
  const router = createRouter()

  router.get('/api/bootstrap', defineEventHandler((event) => {
    requireGatewayAccess(event)
    return {
      gatewayToken: createGatewayAccessToken(),
    }
  }))

  return router
}

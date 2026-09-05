import type { ProviderService } from '../../services/domain/providers'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { createBadRequestError } from '../../utils/error'
import { UpsertProviderConfigSchema } from './schema'

export function createProviderRoutes(providerService: ProviderService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)

    .get('/', async (c) => {
      const user = c.get('user')!
      const providers = await providerService.listAll(user.id)
      return c.json(providers)
    })

    .put('/:id', async (c) => {
      const user = c.get('user')!
      const id = c.req.param('id')
      const body = await c.req.json()
      const result = safeParse(UpsertProviderConfigSchema, body)

      if (!result.success)
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)

      const provider = await providerService.upsert({
        id,
        ownerId: user.id,
        definitionId: result.output.definitionId,
        config: result.output.config,
      })
      return c.json(provider)
    })

    .delete('/:id', async (c) => {
      const user = c.get('user')!
      const id = c.req.param('id')
      await providerService.tombstone(id, user.id)
      return c.body(null, 204)
    })
}

import type { ProviderService } from '../../services/domain/providers'
import type { HonoEnv } from '../../types/hono'

import { createBadRequestError, noContent, ok } from '@proj-airi/http-error-shared'
import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { UpsertProviderConfigSchema } from './schema'

export function createProviderRoutes(providerService: ProviderService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)

    .get('/', async (c) => {
      const user = c.get('user')!
      const providers = await providerService.listAll(user.id)
      // eslint-disable-next-line no-restricted-syntax -- Known deviation in 2026-10-19-http-response-conventions.md: clients read a bare array.
      return c.json(providers)
    })

    .put('/:id', async (c) => {
      const user = c.get('user')!
      const instanceId = c.req.param('id')
      const body = await c.req.json()
      const result = safeParse(UpsertProviderConfigSchema, body)

      if (!result.success)
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)

      const provider = await providerService.upsert({
        instanceId,
        ownerId: user.id,
        definitionId: result.output.definitionId,
        config: result.output.config,
      })
      return ok(c, provider)
    })

    .delete('/:id', async (c) => {
      const user = c.get('user')!
      const instanceId = c.req.param('id')
      await providerService.tombstone(instanceId, user.id)
      return noContent(c)
    })
}

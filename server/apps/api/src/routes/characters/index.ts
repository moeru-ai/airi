import type { CharacterService } from '../../services/domain/characters'
import type { HonoEnv } from '../../types/hono'

import { createBadRequestError, created, createForbiddenError, createNotFoundError, noContent, ok } from '@proj-airi/http-error-shared'
import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { CreateCharacterSchema, UpdateCharacterSchema } from './schema'

export function createCharacterRoutes(characterService: CharacterService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)

    .get('/', async (c) => {
      const user = c.get('user')!
      const all = c.req.query('all') === 'true'

      const characters = all
        ? await characterService.findAll()
        : await characterService.findByOwnerId(user.id)
      // eslint-disable-next-line no-restricted-syntax -- Known deviation in 2026-10-19-http-response-conventions.md: clients read a bare array.
      return c.json(characters)
    })

    .get('/:id', async (c) => {
      const id = c.req.param('id')
      const character = await characterService.findById(id)
      if (!character)
        throw createNotFoundError()

      return ok(c, character)
    })

    .post('/', async (c) => {
      const user = c.get('user')!

      const body = await c.req.json()
      const result = safeParse(CreateCharacterSchema, body)

      if (!result.success) {
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)
      }

      // @ts-expect-error - TODO: Fix this
      const character = await characterService.create({
        ...result.output,
        character: {
          ...result.output.character,
          ownerId: user.id,
          creatorId: user.id,
        },
      })

      return created(c, character)
    })

    .patch('/:id', async (c) => {
      const user = c.get('user')!

      const id = c.req.param('id')
      const body = await c.req.json()
      const result = safeParse(UpdateCharacterSchema, body)

      if (!result.success) {
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)
      }

      // TODO: Move ownership checks into the service layer with an actor-aware API such as updateByOwner(user.id, id, input).
      const existing = await characterService.findById(id)
      if (!existing)
        throw createNotFoundError()
      if (existing.ownerId !== user.id)
        throw createForbiddenError()

      const updated = await characterService.update(id, result.output)
      return ok(c, updated)
    })

    .delete('/:id', async (c) => {
      const user = c.get('user')!

      const id = c.req.param('id')
      // TODO: Move ownership checks into the service layer with an actor-aware API such as deleteByOwner(user.id, id).
      const existing = await characterService.findById(id)
      if (!existing)
        throw createNotFoundError()
      if (existing.ownerId !== user.id)
        throw createForbiddenError()

      await characterService.delete(id)
      return noContent(c)
    })

    .post('/:id/like', async (c) => {
      const user = c.get('user')!
      const id = c.req.param('id')
      const result = await characterService.like(user.id, id)
      return ok(c, result)
    })

    .post('/:id/bookmark', async (c) => {
      const user = c.get('user')!
      const id = c.req.param('id')
      const result = await characterService.bookmark(user.id, id)
      return ok(c, result)
    })
}

import type { CharacterService } from '../services/characters'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { CreateCharacterSchema, UpdateCharacterSchema } from '../api/characters.schema'
import { authGuard } from '../middlewares/auth'
import { createBadRequestError, createForbiddenError, createNotFoundError } from '../utils/error'

export function createCharacterRoutes(characterService: CharacterService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)

    .get('/', async (c) => {
      const user = c.get('user')!
      const all = c.req.query('all') === 'true'

      const characters = all
        ? await characterService.findAll()
        : await characterService.findByOwnerId(user.id)
      return c.json(characters)
    })

    .get('/:id', async (c) => {
      const id = c.req.param('id')
      const character = await characterService.findById(id)
      if (!character)
        throw createNotFoundError()

      return c.json(character)
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

      return c.json(character, 201)
    })

    .patch('/:id', async (c) => {
      const user = c.get('user')!

      const id = c.req.param('id')
      const body = await c.req.json()
      const result = safeParse(UpdateCharacterSchema, body)

      if (!result.success) {
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)
      }

      const existing = await characterService.findById(id)
      if (!existing)
        throw createNotFoundError()
      if (existing.ownerId !== user.id)
        throw createForbiddenError()

      const updated = await characterService.update(id, result.output)
      return c.json(updated)
    })

    .delete('/:id', async (c) => {
      const user = c.get('user')!

      const id = c.req.param('id')
      const existing = await characterService.findById(id)
      if (!existing)
        throw createNotFoundError()
      if (existing.ownerId !== user.id)
        throw createForbiddenError()

      await characterService.delete(id)
      return c.body(null, 204)
    })

    .post('/:id/like', async (c) => {
      const user = c.get('user')!
      const id = c.req.param('id')
      const result = await characterService.like(user.id, id)
      return c.json(result)
    })

    .post('/:id/bookmark', async (c) => {
      const user = c.get('user')!
      const id = c.req.param('id')
      const result = await characterService.bookmark(user.id, id)
      return c.json(result)
    })
}

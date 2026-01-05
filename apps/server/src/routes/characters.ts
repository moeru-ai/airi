import type { CharacterService } from '../services/characters'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { CreateCharacterSchema, UpdateCharacterSchema } from '../api/characters.schema'
import { authGuard } from '../middlewares/auth'
import { createBadRequestError, createForbiddenError, createNotFoundError } from '../utils/error'

export function createCharacterRoutes(characterService: CharacterService) {
  const app = new Hono<HonoEnv>()

  app.use('*', authGuard)

  app.get('/', async (c) => {
    const user = c.get('user')!

    const characters = await characterService.findByOwnerId(user.id)
    return c.json(characters)
  })

  app.get('/:id', async (c) => {
    const id = c.req.param('id')
    const character = await characterService.findById(id)
    if (!character)
      throw createNotFoundError()

    return c.json(character)
  })

  app.post('/', async (c) => {
    const user = c.get('user')!

    const body = await c.req.json()
    const result = safeParse(CreateCharacterSchema, body)

    if (!result.success) {
      throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)
    }

    const character = await characterService.create({
      ...result.output,
      character: {
        ...result.output.character,
        ownerId: user.id,
        creatorId: user.id,
      },
    } as any)

    return c.json(character, 201)
  })

  app.patch('/:id', async (c) => {
    const user = c.get('user')!

    const id = c.req.param('id')
    const body = await c.req.json()
    const result = safeParse(UpdateCharacterSchema, body)

    if (!result.success) {
      throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)
    }

    const existing = await characterService.findById(id, { withRelations: false })
    if (!existing)
      throw createNotFoundError()
    if (existing.ownerId !== user.id)
      throw createForbiddenError()

    const updated = await characterService.update(id, result.output)
    return c.json(updated)
  })

  app.delete('/:id', async (c) => {
    const user = c.get('user')!

    const id = c.req.param('id')
    const existing = await characterService.findById(id, { withRelations: false })
    if (!existing)
      throw createNotFoundError()
    if (existing.ownerId !== user.id)
      throw createForbiddenError()

    await characterService.delete(id)
    return c.body(null, 204)
  })

  return app
}

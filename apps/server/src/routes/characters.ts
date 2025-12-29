import type { CharacterService } from '../services/characters'
import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { CreateCharacterSchema, UpdateCharacterSchema } from '../api/characters.schema'

export function createCharacterRoutes(characterService: CharacterService) {
  const app = new Hono<HonoEnv>()

  app.get('/', async (c) => {
    const user = c.get('user')
    if (!user)
      return c.json({ error: 'Unauthorized' }, 401)

    const characters = await characterService.findByOwnerId(user.id)
    return c.json(characters)
  })

  app.get('/:id', async (c) => {
    const id = c.req.param('id')
    const character = await characterService.findById(id)
    if (!character)
      return c.json({ error: 'Not Found' }, 404)

    return c.json(character)
  })

  app.post('/', async (c) => {
    const user = c.get('user')
    if (!user)
      return c.json({ error: 'Unauthorized' }, 401)

    const body = await c.req.json()
    const result = safeParse(CreateCharacterSchema, body)

    if (!result.success) {
      return c.json({ error: 'Invalid Request', issues: result.issues }, 400)
    }

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

  app.patch('/:id', async (c) => {
    const user = c.get('user')
    if (!user)
      return c.json({ error: 'Unauthorized' }, 401)

    const id = c.req.param('id')
    const body = await c.req.json()
    const result = safeParse(UpdateCharacterSchema, body)

    if (!result.success) {
      return c.json({ error: 'Invalid Request', issues: result.issues }, 400)
    }

    const existing = await characterService.findById(id)
    if (!existing)
      return c.json({ error: 'Not Found' }, 404)
    if (existing.ownerId !== user.id)
      return c.json({ error: 'Forbidden' }, 403)

    const updated = await characterService.update(id, result.output)
    return c.json(updated)
  })

  app.delete('/:id', async (c) => {
    const user = c.get('user')
    if (!user)
      return c.json({ error: 'Unauthorized' }, 401)

    const id = c.req.param('id')
    const existing = await characterService.findById(id)
    if (!existing)
      return c.json({ error: 'Not Found' }, 404)
    if (existing.ownerId !== user.id)
      return c.json({ error: 'Forbidden' }, 403)

    await characterService.delete(id)
    return c.body(null, 204)
  })

  return app
}

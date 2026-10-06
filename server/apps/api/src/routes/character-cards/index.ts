import type { CharacterCardService } from '../../services/domain/character-cards'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

import { authGuard } from '../../middlewares/auth'
import { parseDeleteRevision, parseDocumentId, parsePushRequest, readJsonBody } from '../../services/domain/field-sync'

export function createCharacterCardRoutes(characterCardService: CharacterCardService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)

    .get('/', async (c) => {
      const user = c.get('user')!
      return c.json(await characterCardService.list(user.id))
    })

    .put('/:id', async (c) => {
      const user = c.get('user')!
      const fields = parsePushRequest(await readJsonBody(c.req))
      return c.json(await characterCardService.push(user.id, parseDocumentId(c.req.param('id')), fields))
    })

    .delete('/:id', async (c) => {
      const user = c.get('user')!
      await characterCardService.remove(user.id, parseDocumentId(c.req.param('id')), parseDeleteRevision(c.req.query()))
      return c.body(null, 204)
    })
}

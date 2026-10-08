import type { CharacterCardService } from '../../services/domain/character-cards'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'

import { authGuard } from '../../middlewares/auth'
import { parseDeleteRevision, parseDocumentId, parseHistoryQuery, parsePushRequest, parseRevisionParam, readJsonBody } from '../../services/domain/field-sync'
import { createNotFoundError } from '../../utils/error'

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

    .get('/:id/history', async (c) => {
      const user = c.get('user')!
      const { before, limit } = parseHistoryQuery(c.req.query())
      const history = await characterCardService.history(user.id, parseDocumentId(c.req.param('id')), { before, limit })
      if (history === null)
        throw createNotFoundError('Card Not Found')
      return c.json({ history })
    })

    .get('/:id/history/:revision', async (c) => {
      const user = c.get('user')!
      const revision = parseRevisionParam(c.req.param('revision'))
      const snapshot = await characterCardService.snapshot(user.id, parseDocumentId(c.req.param('id')), revision)
      if (snapshot === null)
        throw createNotFoundError('Card Revision Not Found')
      return c.json(snapshot)
    })
}

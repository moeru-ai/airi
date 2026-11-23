import type { CharacterCardService } from '../../services/domain/character-cards'
import type { HonoEnv } from '../../types/hono'

import { createNotFoundError } from '@proj-airi/http-error-shared'
import { noContent, ok } from '@proj-airi/http-response-shared'
import { Hono } from 'hono'

import { authGuard } from '../../middlewares/auth'
import { parseDeleteRevision, parseDocumentId, parseHistoryQuery, parsePushRequest, parseRevisionParam, readJsonBody } from '../../services/domain/field-sync'

export function createCharacterCardRoutes(characterCardService: CharacterCardService) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)

    .get('/', async (c) => {
      const user = c.get('user')!
      // eslint-disable-next-line no-restricted-syntax -- Known deviation in 2026-10-19-http-response-conventions.md: clients read { documents }.
      return c.json(await characterCardService.list(user.id))
    })

    .put('/:id', async (c) => {
      const user = c.get('user')!
      const fields = parsePushRequest(await readJsonBody(c.req))
      return ok(c, await characterCardService.push(user.id, parseDocumentId(c.req.param('id')), fields))
    })

    .delete('/:id', async (c) => {
      const user = c.get('user')!
      await characterCardService.remove(user.id, parseDocumentId(c.req.param('id')), parseDeleteRevision(c.req.query()))
      return noContent(c)
    })

    .get('/:id/history', async (c) => {
      const user = c.get('user')!
      const { before, limit } = parseHistoryQuery(c.req.query())
      const history = await characterCardService.history(user.id, parseDocumentId(c.req.param('id')), { before, limit })
      if (history === null)
        throw createNotFoundError('Card Not Found')
      // eslint-disable-next-line no-restricted-syntax -- Known deviation in 2026-10-19-http-response-conventions.md: clients read { history }.
      return c.json({ history })
    })

    .get('/:id/history/:revision', async (c) => {
      const user = c.get('user')!
      const revision = parseRevisionParam(c.req.param('revision'))
      const snapshot = await characterCardService.snapshot(user.id, parseDocumentId(c.req.param('id')), revision)
      if (snapshot === null)
        throw createNotFoundError('Card Revision Not Found')
      return ok(c, snapshot)
    })
}

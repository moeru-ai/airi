import type { Database } from '../../libs/db'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'

import { createCharacterCardRoutes } from '.'
import { mockDB } from '../../libs/mock-db'
import { createCharacterCardService } from '../../services/domain/character-cards'
import { ApiError } from '../../utils/error'

import * as schema from '../../schemas'

describe('characterCardRoutes', () => {
  let db: Database
  let app: Hono<HonoEnv>

  function requestAs(userId: string, path: string, init?: RequestInit) {
    return app.fetch(new Request(`http://localhost${path}`, init), { user: { id: userId } })
  }

  function request(path: string, init?: RequestInit) {
    return requestAs('owner', path, init)
  }

  function push(path: string, fields: unknown) {
    return request(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    })
  }

  beforeEach(async () => {
    db = await mockDB(schema)
    app = new Hono<HonoEnv>()
    app.onError((error, c) => error instanceof ApiError
      ? c.json({ error: error.errorCode, message: error.message, details: error.details }, error.statusCode)
      : c.json({ error: 'Internal Server Error', message: error.message }, 500))
    app.use('*', async (c, next) => {
      const user = (c.env as { user?: HonoEnv['Variables']['user'] } | undefined)?.user
      if (user)
        c.set('user', user)
      await next()
    })
    app.route('/', createCharacterCardRoutes(createCharacterCardService(db)))
  })

  it('rejects a request without a user', async () => {
    const response = await app.request('/')

    expect(response.status).toBe(401)
  })

  it('stores, lists, and deletes a card', async () => {
    const pushed = await push('/card', [{ key: '/name', baseRevision: 0, value: 'Luna' }])
    const listed = await request('/')

    expect(pushed.status).toBe(200)
    expect(await listed.json()).toEqual({
      documents: [{ id: 'card', revision: 1, deletedAt: null, fields: [{ key: '/name', revision: 1, value: 'Luna' }] }],
    })

    const stale = await request('/card?revision=0', { method: 'DELETE' })
    const deleted = await request('/card?revision=1', { method: 'DELETE' })

    expect(stale.status).toBe(409)
    expect(deleted.status).toBe(204)
  })

  it('rejects a body that is not valid JSON with 400', async () => {
    const response = await request('/card', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"fields": [' })

    expect(response.status).toBe(400)
  })

  it('rejects invalid input', async () => {
    const nullValue = await push('/card', [{ key: '/name', baseRevision: 0, value: null }])
    const noFields = await push('/card', [])
    const badKey = await push('/card', [{ key: 'name', baseRevision: 0, value: 'Luna' }])
    const noRevision = await request('/card', { method: 'DELETE' })

    expect(nullValue.status).toBe(400)
    expect(noFields.status).toBe(400)
    expect(badKey.status).toBe(400)
    expect(noRevision.status).toBe(400)
  })

  describe('history and snapshots', () => {
    it('lists history and reads a snapshot of an owned card', async () => {
      await push('/card', [{ key: '/name', baseRevision: 0, value: 'Luna' }])
      await push('/card', [{ key: '/name', baseRevision: 1, value: 'Nova' }])

      const history = await request('/card/history')
      expect(history.status).toBe(200)
      expect(await history.json()).toMatchObject({
        history: [
          { revision: 2, changed: ['/name'], removed: [] },
          { revision: 1, changed: ['/name'], removed: [] },
        ],
      })

      const snapshot = await request('/card/history/1')
      expect(snapshot.status).toBe(200)
      expect(await snapshot.json()).toMatchObject({ revision: 1, fields: [{ key: '/name', value: 'Luna' }] })
    })

    it('paginates history with before and limit', async () => {
      for (let i = 0; i < 3; i++)
        await push('/card', [{ key: '/name', baseRevision: i, value: `v${i}` }])

      const page = await request('/card/history?limit=1')
      const pageBody = await page.json() as { history: Array<{ revision: number }> }
      expect(pageBody.history.map(entry => entry.revision)).toEqual([3])

      const nextPage = await request('/card/history?before=3&limit=1')
      const nextPageBody = await nextPage.json() as { history: Array<{ revision: number }> }
      expect(nextPageBody.history.map(entry => entry.revision)).toEqual([2])
    })

    it('rejects an invalid history query and an invalid revision', async () => {
      await push('/card', [{ key: '/name', baseRevision: 0, value: 'Luna' }])

      expect((await request('/card/history?limit=0')).status).toBe(400)
      expect((await request('/card/history?limit=201')).status).toBe(400)
      expect((await request('/card/history/not-a-number')).status).toBe(400)
    })

    it('returns 404 for a card that does not exist and a revision that does not exist', async () => {
      expect((await request('/missing/history')).status).toBe(404)
      expect((await request('/missing/history/1')).status).toBe(404)

      await push('/card', [{ key: '/name', baseRevision: 0, value: 'Luna' }])
      expect((await request('/card/history/99')).status).toBe(404)
    })

    it('does not let another account read a card\'s history or snapshot', async () => {
      await push('/card', [{ key: '/name', baseRevision: 0, value: 'Luna' }])

      expect((await requestAs('other', '/card/history')).status).toBe(404)
      expect((await requestAs('other', '/card/history/1')).status).toBe(404)
    })
  })
})

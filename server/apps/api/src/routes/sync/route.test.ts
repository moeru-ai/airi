import type { Database } from '../../libs/db'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'

import { createSyncRoutes } from '.'
import { mockDB } from '../../libs/mock-db'
import { createSyncedDocumentService } from '../../services/domain/synced-documents'
import { ApiError } from '../../utils/error'

import * as schema from '../../schemas'

describe('syncRoutes', () => {
  let db: Database
  let app: Hono<HonoEnv>

  function request(path: string, init?: RequestInit) {
    return app.fetch(new Request(`http://localhost${path}`, init), { user: { id: 'owner' } })
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
    app.route('/', createSyncRoutes(createSyncedDocumentService(db)))
  })

  it('rejects a request without a user', async () => {
    const response = await app.request('/character-cards')

    expect(response.status).toBe(401)
  })

  it('stores, lists, and deletes a document', async () => {
    const pushed = await push('/character-cards/card', [{ key: '/name', baseRevision: 0, value: 'Luna' }])
    const listed = await request('/character-cards')

    expect(pushed.status).toBe(200)
    expect(await listed.json()).toEqual({
      documents: [{ id: 'card', revision: 1, deletedAt: null, fields: [{ key: '/name', revision: 1, value: 'Luna' }] }],
    })

    const stale = await request('/character-cards/card?revision=0', { method: 'DELETE' })
    const deleted = await request('/character-cards/card?revision=1', { method: 'DELETE' })

    expect(stale.status).toBe(409)
    expect(deleted.status).toBe(204)
  })

  it('rejects a collection that the server does not store', async () => {
    const listed = await request('/unknown')
    const pushed = await push('/unknown/card', [{ key: '/name', baseRevision: 0, value: 'Luna' }])

    expect(listed.status).toBe(400)
    expect(pushed.status).toBe(400)
  })

  it('rejects invalid input', async () => {
    const nullValue = await push('/character-cards/card', [{ key: '/name', baseRevision: 0, value: null }])
    const noFields = await push('/character-cards/card', [])
    const noRevision = await request('/character-cards/card', { method: 'DELETE' })

    expect(nullValue.status).toBe(400)
    expect(noFields.status).toBe(400)
    expect(noRevision.status).toBe(400)
  })
})

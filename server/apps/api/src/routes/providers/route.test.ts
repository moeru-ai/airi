import type { Database } from '../../libs/db'
import type { HonoEnv } from '../../types/hono'

import { Buffer } from 'node:buffer'

import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'

import { createProviderRoutes } from '.'
import { mockDB } from '../../libs/mock-db'
import { createProviderService } from '../../services/domain/providers'
import { createEnvelopeCrypto } from '../../utils/envelope-crypto'
import { ApiError } from '../../utils/error'

import * as schema from '../../schemas'

describe('providerRoutes', () => {
  let db: Database
  let app: Hono<HonoEnv>
  let testUser: { id: string }

  beforeAll(async () => {
    db = await mockDB(schema)
    const providerService = createProviderService(db, createEnvelopeCrypto({ masterKey: Buffer.alloc(32, 7) }))

    const [user] = await db.insert(schema.user).values({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
    }).returning()
    testUser = user

    const routes = createProviderRoutes(providerService)
    app = new Hono<HonoEnv>()

    app.onError((err, c) => {
      if (err instanceof ApiError) {
        return c.json({
          error: err.errorCode,
          message: err.message,
          details: err.details,
        }, err.statusCode)
      }
      return c.json({ error: 'Internal Server Error', message: err.message }, 500)
    })

    app.use('*', async (c, next) => {
      const user = (c.env as { user?: { id: string } })?.user
      if (user)
        c.set('user', user as never)
      await next()
    })

    app.route('/', routes)
  })

  it('get / should return unauthorized if no user', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(401)
  })

  it('get / should return an empty list', async () => {
    const res = await app.fetch(new Request('http://localhost/'), { user: testUser } as never)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('put /:id should create a row with the client id', async () => {
    const res = await app.fetch(new Request('http://localhost/prov-1', {
      method: 'PUT',
      body: JSON.stringify({
        definitionId: 'openai',
        config: { apiKey: 'sk-123' },
      }),
      headers: { 'Content-Type': 'application/json' },
    }), { user: testUser } as never)

    expect(res.status).toBe(200)
    const data = await res.json() as { id: string, config: Record<string, unknown> }
    expect(data.id).toBe('prov-1')
    expect(data.config).toEqual({ apiKey: 'sk-123' })
  })

  it('put /:id should overwrite the stored replica', async () => {
    const res = await app.fetch(new Request('http://localhost/prov-1', {
      method: 'PUT',
      body: JSON.stringify({
        definitionId: 'openai',
        config: { apiKey: 'sk-overwritten' },
      }),
      headers: { 'Content-Type': 'application/json' },
    }), { user: testUser } as never)

    expect(res.status).toBe(200)
    const data = await res.json() as { config: Record<string, unknown> }
    expect(data.config).toEqual({ apiKey: 'sk-overwritten' })
  })

  it('put /:id should let another owner use the same instance id', async () => {
    const [otherUser] = await db.insert(schema.user).values({
      id: 'user-2',
      name: 'Other User',
      email: 'other@example.com',
    }).returning()

    const res = await app.fetch(new Request('http://localhost/prov-1', {
      method: 'PUT',
      body: JSON.stringify({
        definitionId: 'openai',
        config: { apiKey: 'sk-other' },
      }),
      headers: { 'Content-Type': 'application/json' },
    }), { user: otherUser } as never)

    expect(res.status).toBe(200)
    const data = await res.json() as { id: string, config: Record<string, unknown> }
    expect(data.id).toBe('prov-1')
    expect(data.config).toEqual({ apiKey: 'sk-other' })

    const ownerList = await app.fetch(new Request('http://localhost/'), { user: testUser } as never)
    const ownerRows = await ownerList.json() as { id: string, config: Record<string, unknown> }[]
    expect(ownerRows).toHaveLength(1)
    expect(ownerRows[0]?.id).toBe('prov-1')
    expect(ownerRows[0]?.config).toEqual({ apiKey: 'sk-overwritten' })
  })

  it('delete /:id should tombstone and get / should still return the row', async () => {
    const listed = await app.fetch(new Request('http://localhost/'), { user: testUser } as never)
    const [current] = await listed.json() as { id: string, updatedAt: string }[]

    const res = await app.fetch(new Request(`http://localhost/${current.id}`, {
      method: 'DELETE',
    }), { user: testUser } as never)

    expect(res.status).toBe(204)

    const after = await app.fetch(new Request('http://localhost/'), { user: testUser } as never)
    const rows = await after.json() as { id: string, deletedAt: string | null }[]
    expect(rows).toHaveLength(1)
    expect(rows[0]?.deletedAt).toEqual(expect.any(String))
  })
})

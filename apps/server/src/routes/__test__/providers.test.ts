import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createProviderService } from '../../services/providers'
import { ApiError } from '../../utils/error'
import { createProviderRoutes } from '../providers'

import * as schema from '../../schemas'

describe('providerRoutes', () => {
  let db: any
  let providerService: any
  let app: Hono<HonoEnv>
  let testUser: any

  beforeAll(async () => {
    db = await mockDB(schema)
    providerService = createProviderService(db)

    // Create a test user
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
      const user = (c.env as any)?.user
      if (user) {
        c.set('user', user)
      }
      await next()
    })

    app.route('/', routes)
  })

  it('get / should return unauthorized if no user', async () => {
    const res = await app.request('/')
    expect(res.status).toBe(401)
  })

  it('get / should return empty list initially', async () => {
    const res = await app.fetch(new Request('http://localhost/'), { user: testUser } as any)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('post / should create provider config', async () => {
    const payload = {
      definitionId: 'openai',
      name: 'My OpenAI',
      config: { apiKey: 'sk-123' },
    }

    const res = await app.fetch(new Request('http://localhost/', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    }), { user: testUser } as any)

    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.id).toBeDefined()
    expect(data.name).toBe('My OpenAI')
  })

  it('get / should return created provider', async () => {
    const res = await app.fetch(new Request('http://localhost/'), { user: testUser } as any)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.length).toBe(1)
    expect(data[0].definitionId).toBe('openai')
  })

  it('get /:id should return specific provider', async () => {
    const providers = await providerService.findByOwnerId(testUser.id)
    const providerId = providers[0].id

    const res = await app.fetch(new Request(`http://localhost/${providerId}`), { user: testUser } as any)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toBe(providerId)
  })

  it('patch /:id should update provider config', async () => {
    const providers = await providerService.findByOwnerId(testUser.id)
    const providerId = providers[0].id

    const res = await app.fetch(new Request(`http://localhost/${providerId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Updated Name' }),
      headers: { 'Content-Type': 'application/json' },
    }), { user: testUser } as any)

    expect(res.status).toBe(200)
    const updated = await providerService.findById(providerId)
    expect(updated?.name).toBe('Updated Name')
  })

  it('patch /:id should return 403 if not owner', async () => {
    // Create another user
    const [otherUser] = await db.insert(schema.user).values({
      id: 'user-2',
      name: 'Other User',
      email: 'other@example.com',
    }).returning()

    const providers = await providerService.findByOwnerId(testUser.id)
    const providerId = providers[0].id

    const res = await app.fetch(new Request(`http://localhost/${providerId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Hacked Name' }),
      headers: { 'Content-Type': 'application/json' },
    }), { user: otherUser } as any)

    expect(res.status).toBe(403)
  })

  it('delete /:id should soft delete provider', async () => {
    const providers = await providerService.findByOwnerId(testUser.id)
    const providerId = providers[0].id

    const res = await app.fetch(new Request(`http://localhost/${providerId}`, {
      method: 'DELETE',
    }), { user: testUser } as any)

    expect(res.status).toBe(204)
    const deleted = await providerService.findById(providerId)
    expect(deleted).toBeUndefined()
  })
})

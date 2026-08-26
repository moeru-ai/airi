import type { Database } from '../../libs/db'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'

import { createProviderRoutes } from '.'
import { mockDB } from '../../libs/mock-db'
import { createProviderService } from '../../services/domain/providers'
import { ApiError } from '../../utils/error'

import * as schema from '../../schemas'

describe('providerRoutes', () => {
  let db: Database
  let providerService: any
  let app: Hono<HonoEnv>
  let testUser: any

  beforeAll(async () => {
    db = await mockDB(schema)
    providerService = createProviderService(db)

    // Create a test user
    const [user] = await db.insert(schema.user).values({
      email: 'test@example.com',
      id: 'user-1',
      name: 'Test User',
    }).returning()
    testUser = user

    const routes = createProviderRoutes(providerService)
    app = new Hono<HonoEnv>()

    app.onError((err, c) => {
      if (err instanceof ApiError) {
        return c.json({
          details: err.details,
          error: err.errorCode,
          message: err.message,
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

  it('get / should return empty list initially (only user configs, system configs tested later)', async () => {
    const res = await app.fetch(new Request('http://localhost/'), { user: testUser } as any)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('post / should create provider config', async () => {
    const payload = {
      config: { apiKey: 'sk-123' },
      definitionId: 'openai',
      name: 'My OpenAI',
    }

    const res = await app.fetch(new Request('http://localhost/', {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }), { user: testUser } as any)

    expect(res.status).toBe(201)
    const data = await res.json() as any
    expect(data.id).toBeDefined()
    expect(data.name).toBe('My OpenAI')
  })

  it('get / should return unified list (user + system)', async () => {
    // Create a system config directly in DB
    await db.insert(schema.systemProviderConfigs).values({
      config: { apiKey: 'sys-sk' },
      definitionId: 'anthropic',
      id: 'sys-1',
      name: 'System Anthropic',
    })

    const res = await app.fetch(new Request('http://localhost/'), { user: testUser } as any)
    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.length).toBe(2)
    expect(data.some((p: any) => p.isSystem === true)).toBe(true)
    expect(data.some((p: any) => p.isSystem === false)).toBe(true)
  })

  it('get /:id should return specific provider (user or system)', async () => {
    const providers = await providerService.findUserConfigsByOwnerId(testUser.id)
    const providerId = providers[0].id

    const res = await app.fetch(new Request(`http://localhost/${providerId}`), { user: testUser } as any)
    expect(res.status).toBe(200)
    const data = await res.json() as any
    expect(data.id).toBe(providerId)
    expect(data.isSystem).toBe(false)

    // Test system config access
    const resSys = await app.fetch(new Request('http://localhost/sys-1'), { user: testUser } as any)
    expect(resSys.status).toBe(200)
    const dataSys = await resSys.json() as any
    expect(dataSys.id).toBe('sys-1')
    expect(dataSys.isSystem).toBe(true)
  })

  it('patch /:id should update provider config', async () => {
    const providers = await providerService.findUserConfigsByOwnerId(testUser.id)
    const providerId = providers[0].id

    const res = await app.fetch(new Request(`http://localhost/${providerId}`, {
      body: JSON.stringify({ name: 'Updated Name' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }), { user: testUser } as any)

    expect(res.status).toBe(200)
    const updated = await providerService.findUserConfigById(providerId)
    expect(updated?.name).toBe('Updated Name')
  })

  it('patch /:id should return 403 if not owner', async () => {
    // Create another user
    const [otherUser] = await db.insert(schema.user).values({
      email: 'other@example.com',
      id: 'user-2',
      name: 'Other User',
    }).returning()

    const providers = await providerService.findUserConfigsByOwnerId(testUser.id)
    const providerId = providers[0].id

    const res = await app.fetch(new Request(`http://localhost/${providerId}`, {
      body: JSON.stringify({ name: 'Hacked Name' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }), { user: otherUser } as any)

    expect(res.status).toBe(403)
  })

  it('delete /:id should soft delete provider', async () => {
    const providers = await providerService.findUserConfigsByOwnerId(testUser.id)
    const providerId = providers[0].id

    const res = await app.fetch(new Request(`http://localhost/${providerId}`, {
      method: 'DELETE',
    }), { user: testUser } as any)

    expect(res.status).toBe(204)
    const deleted = await providerService.findUserConfigById(providerId)
    expect(deleted).toBeUndefined()
  })
})

import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createCharacterService } from '../../services/characters'
import { ApiError } from '../../utils/error'
import { createCharacterRoutes } from '../characters'

import * as schema from '../../schemas'

describe('characterRoutes', () => {
  let db: any
  let characterService: any
  let app: Hono<HonoEnv>
  let testUser: any

  beforeAll(async () => {
    db = await mockDB(schema)
    characterService = createCharacterService(db)

    // Create a test user
    const [user] = await db.insert(schema.user).values({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
    }).returning()
    testUser = user

    const routes = createCharacterRoutes(characterService)
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

  it('post / should create character with cover', async () => {
    const payload = {
      character: { version: '1', coverUrl: 'url', characterId: 'cid' },
      i18n: [{ language: 'en', name: 'Aster', description: 'desc', tags: [] }],
      cover: { foregroundUrl: 'fg', backgroundUrl: 'bg' },
    }

    const res = await app.fetch(new Request('http://localhost/', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    }), { user: testUser } as any)

    expect(res.status).toBe(201)
    const data = await res.json()
    expect(data.id).toBeDefined()

    const char = await characterService.findById(data.id)
    expect(char?.cover?.foregroundUrl).toBe('fg')
  })

  it('get / should return created character', async () => {
    const res = await app.fetch(new Request('http://localhost/'), { user: testUser } as any)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.length).toBe(1)
    expect(data[0].i18n[0].name).toBe('Aster')
  })

  it('post /:id/like should toggle like', async () => {
    const characters = await characterService.findAll()
    const charId = characters[0].id

    const res = await app.fetch(new Request(`http://localhost/${charId}/like`, { method: 'POST' }), { user: testUser } as any)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ liked: true })

    const res2 = await app.fetch(new Request('http://localhost/'), { user: testUser } as any)
    const data = await res2.json()
    expect(data[0].likesCount).toBe(1)
  })

  it('get /:id should return 404 if not found', async () => {
    const res = await app.fetch(new Request('http://localhost/non-existent'), { user: testUser } as any)
    expect(res.status).toBe(404)
  })

  it('patch /:id should update character', async () => {
    const characters = await characterService.findAll()
    const charId = characters[0].id

    const res = await app.fetch(new Request(`http://localhost/${charId}`, {
      method: 'PATCH',
      body: JSON.stringify({ version: '2.0' }),
      headers: { 'Content-Type': 'application/json' },
    }), { user: testUser } as any)

    expect(res.status).toBe(200)
    const char = await characterService.findById(charId)
    expect(char?.version).toBe('2.0')
  })

  it('patch /:id should return 403 if not owner', async () => {
    // Create another user
    const [otherUser] = await db.insert(schema.user).values({
      id: 'user-2',
      name: 'Other User',
      email: 'other@example.com',
    }).returning()

    const characters = await characterService.findAll()
    const charId = characters[0].id

    const res = await app.fetch(new Request(`http://localhost/${charId}`, {
      method: 'PATCH',
      body: JSON.stringify({ version: '3.0' }),
      headers: { 'Content-Type': 'application/json' },
    }), { user: otherUser } as any)

    expect(res.status).toBe(403)
  })

  it('delete /:id should soft delete', async () => {
    const characters = await characterService.findAll()
    const charId = characters[0].id

    const res = await app.fetch(new Request(`http://localhost/${charId}`, {
      method: 'DELETE',
    }), { user: testUser } as any)

    expect(res.status).toBe(204)
    const char = await characterService.findById(charId)
    expect(char).toBeUndefined()
  })
})

import type { Database } from '../../libs/db'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { beforeAll, describe, expect, it } from 'vitest'

import { createCharacterRoutes } from '.'
import { mockDB } from '../../libs/mock-db'
import { createCharacterService } from '../../services/domain/characters'
import { ApiError } from '../../utils/error'

import * as schema from '../../schemas'

describe('characterRoutes', () => {
  let db: Database
  let characterService: any
  let app: Hono<HonoEnv>
  let testUser: any

  beforeAll(async () => {
    db = await mockDB(schema)
    characterService = createCharacterService(db)

    // Create a test user
    const [user] = await db.insert(schema.user).values({
      email: 'test@example.com',
      id: 'user-1',
      name: 'Test User',
    }).returning()
    testUser = user

    const routes = createCharacterRoutes(characterService)
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

  it('get / should return empty list initially', async () => {
    const res = await app.fetch(new Request('http://localhost/'), { user: testUser } as any)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it('post / should create character with cover', async () => {
    const payload = {
      character: { characterId: 'cid', coverUrl: 'url', version: '1' },
      cover: { backgroundUrl: 'bg', foregroundUrl: 'fg' },
      i18n: [{ description: 'desc', language: 'en', name: 'Aster', tags: [] }],
    }

    const res = await app.fetch(new Request('http://localhost/', {
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    }), { user: testUser } as any)

    expect(res.status).toBe(201)
    const data = await res.json() as any
    expect(data.id).toBeDefined()

    const char = await characterService.findById(data.id)
    expect(char?.cover?.foregroundUrl).toBe('fg')
  })

  it('get / should return created character', async () => {
    const res = await app.fetch(new Request('http://localhost/'), { user: testUser } as any)
    expect(res.status).toBe(200)
    const data = await res.json() as any
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
    const data = await res2.json() as any
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
      body: JSON.stringify({ version: '2.0' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }), { user: testUser } as any)

    expect(res.status).toBe(200)
    const char = await characterService.findById(charId)
    expect(char?.version).toBe('2.0')
  })

  it('patch /:id should return 403 if not owner', async () => {
    // Create another user
    const [otherUser] = await db.insert(schema.user).values({
      email: 'other@example.com',
      id: 'user-2',
      name: 'Other User',
    }).returning()

    const characters = await characterService.findAll()
    const charId = characters[0].id

    const res = await app.fetch(new Request(`http://localhost/${charId}`, {
      body: JSON.stringify({ version: '3.0' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
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

import type { HonoEnv } from '../types/hono'

import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createCharacterRoutes } from './characters'

describe('characterRoutes', () => {
  let characterService: any
  let app: Hono<HonoEnv>

  beforeEach(() => {
    characterService = {
      findById: vi.fn(),
      findByOwnerId: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    }
    auth = {
      $Infer: {
        Session: {
          user: {},
          session: {},
        },
      },
    }

    const routes = createCharacterRoutes(characterService)
    app = new Hono<HonoEnv>()

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

  it('get / should return characters for user', async () => {
    const mockUser = { id: 'user-1' }
    const mockChars = [{ id: 'char-1' }]
    characterService.findByOwnerId.mockResolvedValue(mockChars)

    const res = await app.fetch(new Request('http://localhost/'), { user: mockUser } as any)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(mockChars)
  })

  it('get /:id should return 404 if not found', async () => {
    characterService.findById.mockResolvedValue(null)
    const res = await app.request('/char-1')
    expect(res.status).toBe(404)
  })

  it('get /:id should return character', async () => {
    const mockChar = { id: 'char-1' }
    characterService.findById.mockResolvedValue(mockChar)
    const res = await app.request('/char-1')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(mockChar)
  })

  it('post / should return unauthorized if no user', async () => {
    const res = await app.request('/', { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('post / should validate body and create character', async () => {
    const mockUser = { id: 'user-1' }
    const payload = {
      character: { id: 'c1', version: '1', coverUrl: 'url', characterId: 'cid' },
    }
    characterService.create.mockResolvedValue({ id: 'new-id' })

    const res = await app.fetch(new Request('http://localhost/', {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'Content-Type': 'application/json' },
    }), { user: mockUser } as any)

    expect(res.status).toBe(201)
  })

  it('post / should return 400 on invalid body', async () => {
    const mockUser = { id: 'user-1' }
    const res = await app.fetch(new Request('http://localhost/', {
      method: 'POST',
      body: JSON.stringify({ invalid: 'data' }),
      headers: { 'Content-Type': 'application/json' },
    }), { user: mockUser } as any)

    expect(res.status).toBe(400)
  })

  it('patch /:id should return unauthorized if no user', async () => {
    const res = await app.request('/c1', { method: 'PATCH' })
    expect(res.status).toBe(401)
  })

  it('patch /:id should return 400 on invalid body', async () => {
    const mockUser = { id: 'user-1' }
    const res = await app.fetch(new Request('http://localhost/c1', {
      method: 'PATCH',
      body: JSON.stringify({ version: 123 }),
      headers: { 'Content-Type': 'application/json' },
    }), { user: mockUser } as any)
    expect(res.status).toBe(400)
  })

  it('patch /:id should return 404 if not found', async () => {
    const mockUser = { id: 'user-1' }
    characterService.findById.mockResolvedValue(null)
    const res = await app.fetch(new Request('http://localhost/c1', {
      method: 'PATCH',
      body: JSON.stringify({ version: '2' }),
      headers: { 'Content-Type': 'application/json' },
    }), { user: mockUser } as any)
    expect(res.status).toBe(404)
  })

  it('patch /:id should return 403 if not owner', async () => {
    const mockUser = { id: 'user-1' }
    characterService.findById.mockResolvedValue({ id: 'c1', ownerId: 'user-2' })
    const res = await app.fetch(new Request('http://localhost/c1', {
      method: 'PATCH',
      body: JSON.stringify({ version: '2' }),
      headers: { 'Content-Type': 'application/json' },
    }), { user: mockUser } as any)
    expect(res.status).toBe(403)
  })

  it('patch /:id should update if owner', async () => {
    const mockUser = { id: 'user-1' }
    characterService.findById.mockResolvedValue({ id: 'c1', ownerId: 'user-1' })
    characterService.update.mockResolvedValue({ id: 'c1', version: '2' })
    const res = await app.fetch(new Request('http://localhost/c1', {
      method: 'PATCH',
      body: JSON.stringify({ version: '2' }),
      headers: { 'Content-Type': 'application/json' },
    }), { user: mockUser } as any)
    expect(res.status).toBe(200)
  })

  it('patch /:id should update with empty body', async () => {
    const mockUser = { id: 'user-1' }
    characterService.findById.mockResolvedValue({ id: 'c1', ownerId: 'user-1' })
    characterService.update.mockResolvedValue({ id: 'c1' })
    const res = await app.fetch(new Request('http://localhost/c1', {
      method: 'PATCH',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    }), { user: mockUser } as any)
    expect(res.status).toBe(200)
  })

  it('delete /:id should return unauthorized if no user', async () => {
    const res = await app.request('/c1', { method: 'DELETE' })
    expect(res.status).toBe(401)
  })

  it('delete /:id should return 404 if not found', async () => {
    const mockUser = { id: 'user-1' }
    characterService.findById.mockResolvedValue(null)
    const res = await app.fetch(new Request('http://localhost/c1', { method: 'DELETE' }), { user: mockUser } as any)
    expect(res.status).toBe(404)
  })

  it('delete /:id should return 403 if not owner', async () => {
    const mockUser = { id: 'user-1' }
    characterService.findById.mockResolvedValue({ id: 'c1', ownerId: 'user-2' })
    const res = await app.fetch(new Request('http://localhost/c1', { method: 'DELETE' }), { user: mockUser } as any)
    expect(res.status).toBe(403)
  })

  it('delete /:id should delete if owner', async () => {
    const mockUser = { id: 'user-1' }
    characterService.findById.mockResolvedValue({ id: 'c1', ownerId: 'user-1' })
    const res = await app.fetch(new Request('http://localhost/c1', { method: 'DELETE' }), { user: mockUser } as any)
    expect(res.status).toBe(204)
  })
})

import type { Database } from '../../libs/db'

import { beforeAll, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createCharacterService } from './characters'

import * as schema from '../../schemas'

describe('characterService', () => {
  let db: Database
  let service: ReturnType<typeof createCharacterService>
  let testUser: any

  beforeAll(async () => {
    db = await mockDB(schema)
    service = createCharacterService(db)

    // Create a test user for foreign key constraints
    const [user] = await db.insert(schema.user).values({
      email: 'test@example.com',
      id: 'user-1',
      name: 'Test User',
    }).returning()
    testUser = user
  })

  it('create should handle full character creation', async () => {
    const characterData = {
      characterId: 'cid',
      coverUrl: 'url',
      creatorId: testUser.id,
      id: 'char-1',
      ownerId: testUser.id,
      version: '1.0',
    }

    const result = await service.create({
      character: characterData,
      cover: { backgroundUrl: 'bg', foregroundUrl: 'fg' },
      i18n: [{ description: 'desc', language: 'en', name: 'Aster', tags: [] }],
    })

    expect(result.id).toBe('char-1')

    const found = await service.findById('char-1')
    expect(found?.i18n[0].name).toBe('Aster')
    expect(found?.cover?.foregroundUrl).toBe('fg')
  })

  it('findAll should return characters with relations', async () => {
    const result = await service.findAll()
    expect(result.length).toBeGreaterThan(0)
    expect(result[0].i18n).toBeDefined()
  })

  it('like should toggle like status and update counter', async () => {
    const charId = 'char-1'

    // First like
    const res1 = await service.like(testUser.id, charId)
    expect(res1.liked).toBe(true)

    let char = await service.findById(charId)
    expect(char?.likesCount).toBe(1)
    expect(char?.likes.length).toBe(1)

    // Second like (unlike)
    const res2 = await service.like(testUser.id, charId)
    expect(res2.liked).toBe(false)

    char = await service.findById(charId)
    expect(char?.likesCount).toBe(0)
    expect(char?.likes.length).toBe(0)
  })

  it('bookmark should toggle bookmark status and update counter', async () => {
    const charId = 'char-1'

    // First bookmark
    const res1 = await service.bookmark(testUser.id, charId)
    expect(res1.bookmarked).toBe(true)

    let char = await service.findById(charId)
    expect(char?.bookmarksCount).toBe(1)

    // Second bookmark (unbookmark)
    const res2 = await service.bookmark(testUser.id, charId)
    expect(res2.bookmarked).toBe(false)

    char = await service.findById(charId)
    expect(char?.bookmarksCount).toBe(0)
  })

  it('update should update character fields', async () => {
    await service.update('char-1', { version: '2.0' })
    const char = await service.findById('char-1')
    expect(char?.version).toBe('2.0')
  })

  it('delete should soft delete character', async () => {
    await service.delete('char-1')
    const char = await service.findById('char-1')
    expect(char).toBeUndefined()
  })
})

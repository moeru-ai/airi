import { beforeAll, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createCharacterService } from '../characters'

import * as schema from '../../schemas'

describe('characterService', () => {
  let db: any
  let service: ReturnType<typeof createCharacterService>
  let testUser: any

  beforeAll(async () => {
    db = await mockDB(schema)
    service = createCharacterService(db)

    // Create a test user for foreign key constraints
    const [user] = await db.insert(schema.user).values({
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
    }).returning()
    testUser = user
  })

  it('create should handle full character creation', async () => {
    const characterData = {
      id: 'char-1',
      version: '1.0',
      coverUrl: 'url',
      characterId: 'cid',
      ownerId: testUser.id,
      creatorId: testUser.id,
    }

    const result = await service.create({
      character: characterData,
      i18n: [{ language: 'en', name: 'Aster', description: 'desc', tags: [] }],
      cover: { foregroundUrl: 'fg', backgroundUrl: 'bg' },
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

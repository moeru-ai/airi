import type { Database } from '../../libs/db'

import { beforeEach, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createCharacterCardService } from './character-cards'

import * as schema from '../../schemas'

describe('characterCardService', () => {
  let db: Database

  beforeEach(async () => {
    db = await mockDB(schema)
  })

  it('stores a card in the character card tables', async () => {
    const service = createCharacterCardService(db)

    await service.push('owner', 'card', [{ key: '/name', baseRevision: 0, value: 'Luna' }])

    expect(await db.select().from(schema.characterCards)).toHaveLength(1)
    expect(await db.select().from(schema.characterCardFields)).toMatchObject([{ key: '/name', value: 'Luna' }])
  })

  it('rejects a field key that is not a JSON Pointer', async () => {
    const service = createCharacterCardService(db)

    await expect(service.push('owner', 'card', [{ key: 'name', baseRevision: 0, value: 'Luna' }])).rejects.toMatchObject({ statusCode: 400 })
    expect(await db.select().from(schema.characterCards)).toEqual([])
  })
})

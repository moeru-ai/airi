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

  it.each([
    'name',
    '',
    '/name~2x',
    '/name~',
  ])('rejects the key %j that is not a JSON Pointer', async (key) => {
    const service = createCharacterCardService(db)

    await expect(service.push('owner', 'card', [{ key, baseRevision: 0, value: 'Luna' }])).rejects.toMatchObject({ statusCode: 400 })
    expect(await db.select().from(schema.characterCards)).toEqual([])
  })

  it.each([
    ['/name', 'Nova'],
    ['/extensions/depth~1prompt', { depth: 4 }],
    ['/extensions/airi/wakeWords', []],
    ['/extensions/unknown/anything', 42],
  ])('accepts the key %s with a value of any shape that the client can read', async (key, value) => {
    const service = createCharacterCardService(db)

    const result = await service.push('owner', 'card', [{ key, baseRevision: 0, value }])

    expect(result.conflicts).toEqual([])
  })

  // The client reads these keys without a further check. A value of another
  // shape fails the card on every device, so the server rejects it.
  it.each([
    ['/extensions/airi/wakeWords', 'not a list'],
    ['/extensions/airi/modules/speech', ['not an object']],
    ['/extensions/airi/modules/displayModelId', 7],
    ['/tags', 'not a list'],
    ['/name', { not: 'text' }],
  ])('rejects the value of %s that has the wrong shape', async (key, value) => {
    const service = createCharacterCardService(db)

    await expect(service.push('owner', 'card', [{ key, baseRevision: 0, value }])).rejects.toMatchObject({ statusCode: 400 })
    expect(await db.select().from(schema.characterCards)).toEqual([])
  })

  it('accepts the removal of a known field', async () => {
    const service = createCharacterCardService(db)
    await service.push('owner', 'card', [{ key: '/tags', baseRevision: 0, value: ['calm'] }, { key: '/name', baseRevision: 0, value: 'Luna' }])

    const result = await service.push('owner', 'card', [{ key: '/tags', baseRevision: 1, removed: true }])

    expect(result.document.fields).toEqual([{ key: '/name', revision: 1, value: 'Luna' }])
  })
})

import type { Database } from '../../../libs/db'
import type { PushedField } from './request'
import type { FieldSyncStore } from './store'

import { beforeEach, describe, expect, it } from 'vitest'

import { mockDB } from '../../../libs/mock-db'
import { defineFieldSyncTables } from '../../../schemas/field-sync'
import { createBadRequestError } from '../../../utils/error'
import { createFieldSyncStore } from './store'

import * as schema from '../../../schemas'

// The store works with the tables of any feature. These tables prove that it
// does not depend on the character card tables.
const tables = defineFieldSyncTables('field_sync_test')

describe('fieldSyncStore', () => {
  let db: Database
  let store: FieldSyncStore

  const push = (fields: PushedField[], ownerId = 'owner') => store.push(ownerId, 'doc', fields)
  const list = async (ownerId = 'owner') => (await store.list(ownerId)).documents

  beforeEach(async () => {
    db = await mockDB({ ...schema, fieldSyncTestDocuments: tables.documents, fieldSyncTestFields: tables.fields })
    store = createFieldSyncStore(db, tables, {
      validate: (fields) => {
        if (fields.some(field => field.key === '/forbidden'))
          throw createBadRequestError('Forbidden key')
      },
    })
  })

  it('stores a new document and lists it for its owner only', async () => {
    const pushed = await push([
      { key: '/name', baseRevision: 0, value: 'Luna' },
      { key: '/tags', baseRevision: 0, value: ['calm'] },
    ])

    expect(pushed.conflicts).toEqual([])
    expect(pushed.document).toMatchObject({ id: 'doc', revision: 1, deletedAt: null })
    expect(await list()).toEqual([pushed.document])
    expect(await list('other')).toEqual([])
  })

  it('accepts changes to different fields from two devices', async () => {
    await push([
      { key: '/name', baseRevision: 0, value: 'Luna' },
      { key: '/description', baseRevision: 0, value: 'First' },
    ])

    const first = await push([{ key: '/name', baseRevision: 1, value: 'Nova' }])
    const second = await push([{ key: '/description', baseRevision: 1, value: 'Second' }])

    expect(first.conflicts).toEqual([])
    expect(second.conflicts).toEqual([])
    expect(second.document.fields).toEqual(expect.arrayContaining([
      { key: '/name', revision: 2, value: 'Nova' },
      { key: '/description', revision: 3, value: 'Second' },
    ]))
  })

  it('reports a conflict for a stale field and applies the other fields', async () => {
    await push([
      { key: '/name', baseRevision: 0, value: 'Luna' },
      { key: '/description', baseRevision: 0, value: 'First' },
    ])
    await push([{ key: '/name', baseRevision: 1, value: 'Nova' }])

    const stale = await push([
      { key: '/name', baseRevision: 1, value: 'Aria' },
      { key: '/description', baseRevision: 1, value: 'Second' },
    ])

    expect(stale.conflicts).toEqual(['/name'])
    expect(stale.document.fields).toEqual(expect.arrayContaining([
      { key: '/name', revision: 2, value: 'Nova' },
      { key: '/description', revision: 3, value: 'Second' },
    ]))
  })

  it('accepts a retried push without a new revision', async () => {
    const fields = [{ key: '/name', baseRevision: 0, value: { first: 'Luna', last: 'A' } }]
    const first = await push(fields)
    const retried = await push(fields)

    expect(retried.conflicts).toEqual([])
    expect(retried.document).toEqual(first.document)
  })

  it('removes a field and rejects a later change from its old revision', async () => {
    await push([
      { key: '/name', baseRevision: 0, value: 'Luna' },
      { key: '/nickname', baseRevision: 0, value: 'Lu' },
    ])

    const removed = await push([{ key: '/nickname', baseRevision: 1, removed: true }])
    const stale = await push([{ key: '/nickname', baseRevision: 1, value: 'Lulu' }])

    expect(removed.document.fields).toEqual([{ key: '/name', revision: 1, value: 'Luna' }])
    expect(stale.conflicts).toEqual(['/nickname'])
  })

  it('does not create a document when the store accepts no field', async () => {
    const result = await push([{ key: '/name', baseRevision: 4, value: 'Luna' }])

    expect(result.conflicts).toEqual(['/name'])
    expect(await list()).toEqual([])
  })

  it('keeps a deletion marker without content', async () => {
    await push([{ key: '/name', baseRevision: 0, value: 'Luna' }])

    await store.remove('owner', 'doc', 1)
    await store.remove('owner', 'doc', 1)

    expect(await list()).toEqual([{ id: 'doc', revision: 2, deletedAt: expect.any(String), fields: [] }])
  })

  it('rejects a deletion when another device changed the document', async () => {
    await push([{ key: '/name', baseRevision: 0, value: 'Luna' }])
    await push([{ key: '/name', baseRevision: 1, value: 'Nova' }])

    await expect(store.remove('owner', 'doc', 1)).rejects.toMatchObject({ statusCode: 409 })
    expect((await list())[0].deletedAt).toBeNull()
  })

  it('restores a deleted document with revisions above the deleted ones', async () => {
    await push([{ key: '/name', baseRevision: 0, value: 'Luna' }])
    await store.remove('owner', 'doc', 1)

    const stale = await push([{ key: '/name', baseRevision: 1, value: 'Nova' }])
    const restored = await push([{ key: '/name', baseRevision: 0, value: 'Nova' }])

    expect(stale.conflicts).toEqual(['/name'])
    expect(stale.document.deletedAt).toEqual(expect.any(String))
    expect(restored.document).toEqual({ id: 'doc', revision: 3, deletedAt: null, fields: [{ key: '/name', revision: 3, value: 'Nova' }] })
  })

  it('rejects a push that the validation rejects and writes nothing', async () => {
    await expect(push([{ key: '/forbidden', baseRevision: 0, value: 'x' }])).rejects.toMatchObject({ statusCode: 400 })

    expect(await list()).toEqual([])
  })

  it('removes the content of a deleted account', async () => {
    await push([{ key: '/name', baseRevision: 0, value: 'Luna' }])
    await push([{ key: '/name', baseRevision: 0, value: 'Kept' }], 'other')

    await store.deleteAllForUser('owner')
    await store.deleteAllForUser('owner')

    expect(await list()).toEqual([{ id: 'doc', revision: 1, deletedAt: expect.any(String), fields: [] }])
    expect((await list('other'))[0].fields).toEqual([{ key: '/name', revision: 1, value: 'Kept' }])
  })
})

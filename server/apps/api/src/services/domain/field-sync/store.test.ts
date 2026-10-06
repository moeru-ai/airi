import type { Database } from '../../../libs/db'
import type { PushedField } from './request'
import type { FieldSyncStore } from './store'

import { eq } from 'drizzle-orm'
import { foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it } from 'vitest'

import { mockDB } from '../../../libs/mock-db'
import { createBadRequestError } from '../../../utils/error'
import { createFieldSyncStore } from './store'

import * as schema from '../../../schemas'

// These tables belong to no feature. They prove that the store works with any
// tables that have the required columns, and that a feature can add its own.
const documents = pgTable(
  'field_sync_test',
  {
    ownerId: text('owner_id').notNull(),
    documentId: text('document_id').notNull(),
    revision: integer('revision').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
    contentHash: text('content_hash'),
    sizeBytes: integer('size_bytes').notNull().default(0),
  },
  table => [
    primaryKey({ name: 'field_sync_test_pk', columns: [table.ownerId, table.documentId] }),
    index('field_sync_test_hash_idx').on(table.contentHash),
  ],
)

const fields = pgTable(
  'field_sync_test_fields',
  {
    ownerId: text('owner_id').notNull(),
    documentId: text('document_id').notNull(),
    key: text('key').notNull(),
    value: jsonb('value').notNull().$type<unknown>(),
    revision: integer('revision').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    primaryKey({ name: 'field_sync_test_fields_pk', columns: [table.ownerId, table.documentId, table.key] }),
    foreignKey({
      name: 'field_sync_test_fields_document_fk',
      columns: [table.ownerId, table.documentId],
      foreignColumns: [documents.ownerId, documents.documentId],
    }).onDelete('cascade'),
  ],
)

describe('fieldSyncStore', () => {
  let db: Database
  let store: FieldSyncStore

  const push = (fields: PushedField[], ownerId = 'owner') => store.push(ownerId, 'doc', fields)
  const list = async (ownerId = 'owner') => (await store.list(ownerId)).documents

  beforeEach(async () => {
    db = await mockDB({ ...schema, fieldSyncTestDocuments: documents, fieldSyncTestFields: fields })
    store = createFieldSyncStore(db, { documents, fields }, {
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

  it('keeps the columns that the feature added to its table', async () => {
    await push([{ key: '/name', baseRevision: 0, value: 'Luna' }])
    await db.update(documents).set({ contentHash: 'abc', sizeBytes: 12 }).where(eq(documents.ownerId, 'owner'))

    await push([{ key: '/name', baseRevision: 1, value: 'Nova' }])
    await store.remove('owner', 'doc', 2)

    const [row] = await db.select().from(documents)
    expect(row).toMatchObject({ contentHash: 'abc', sizeBytes: 12, revision: 3 })
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

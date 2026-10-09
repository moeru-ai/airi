import type { Database } from '../../../libs/db'
import type { PushedField } from './request'
import type { FieldSyncHistoryOptions, FieldSyncStore } from './store'

import { eq } from 'drizzle-orm'
import { foreignKey, index, integer, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it } from 'vitest'

import { jsonValue } from '../../../libs/json-value'
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
    value: jsonValue('value'),
    revision: integer('revision').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    primaryKey({ name: 'field_sync_test_fields_pk', columns: [table.ownerId, table.documentId, table.key, table.revision] }),
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

  it('returns a string value that looks like JSON as the same string', async () => {
    const values = ['1.0', 'true', 'null', '123', '{"a":1}', '"quoted"']
    await push(values.map((value, index) => ({ key: `/text${index}`, baseRevision: 0, value })))

    const [document] = await list()
    expect(document.fields.map(field => field.value).sort()).toEqual([...values].sort())
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

  describe('limits', () => {
    const pushTo = (limited: FieldSyncStore, documentId: string, value: unknown, ownerId = 'owner') =>
      limited.push(ownerId, documentId, [{ key: '/value', baseRevision: 0, value }])

    it('rejects a push that adds a document past the limit and writes nothing', async () => {
      const limited = createFieldSyncStore(db, { documents, fields }, { limits: { maxDocuments: 2, maxBytes: 1000 } })
      await pushTo(limited, 'a', 'x')
      await pushTo(limited, 'b', 'x')

      await expect(pushTo(limited, 'c', 'x')).rejects.toMatchObject({ statusCode: 413, errorCode: 'STORAGE_LIMIT_EXCEEDED' })

      expect((await limited.list('owner')).documents.map(document => document.id)).toEqual(['a', 'b'])
    })

    it('does not count a deleted document, and counts the account of one owner only', async () => {
      const limited = createFieldSyncStore(db, { documents, fields }, { limits: { maxDocuments: 1, maxBytes: 1000 } })
      await pushTo(limited, 'a', 'x')
      await limited.remove('owner', 'a', 1)

      await pushTo(limited, 'b', 'x')
      await pushTo(limited, 'a', 'x', 'other')

      await expect(pushTo(limited, 'c', 'x')).rejects.toMatchObject({ statusCode: 413 })
    })

    it('rejects a push that grows the stored bytes past the limit', async () => {
      const limited = createFieldSyncStore(db, { documents, fields }, { limits: { maxDocuments: 10, maxBytes: 100 } })
      await pushTo(limited, 'a', 'x'.repeat(60))

      await expect(pushTo(limited, 'b', 'y'.repeat(60))).rejects.toMatchObject({ statusCode: 413 })
      await expect(limited.push('owner', 'a', [{ key: '/value', baseRevision: 1, value: 'z'.repeat(120) }])).rejects.toMatchObject({ statusCode: 413 })

      expect((await limited.list('owner')).documents).toHaveLength(1)
      expect((await limited.list('owner')).documents[0].fields[0].value).toBe('x'.repeat(60))
    })

    // An account can be over a limit after the limit was lowered. It must still be able to shrink.
    it('lets an account over its limit delete and shrink', async () => {
      const roomy = createFieldSyncStore(db, { documents, fields }, { limits: { maxDocuments: 10, maxBytes: 1000 } })
      await pushTo(roomy, 'a', 'x'.repeat(200))
      await pushTo(roomy, 'b', 'x')
      const strict = createFieldSyncStore(db, { documents, fields }, { limits: { maxDocuments: 1, maxBytes: 100 } })

      await expect(pushTo(strict, 'c', 'x')).rejects.toMatchObject({ statusCode: 413 })
      await strict.push('owner', 'a', [{ key: '/value', baseRevision: 1, value: 'small' }])
      await strict.remove('owner', 'b', 1)

      expect((await strict.list('owner')).documents.find(document => document.id === 'a')?.fields[0].value).toBe('small')
    })

    it('does not check a store without limits', async () => {
      await push([{ key: '/value', baseRevision: 0, value: 'x'.repeat(10_000) }])

      expect(await list()).toHaveLength(1)
    })
  })

  it('removes the content of a deleted account', async () => {
    await push([{ key: '/name', baseRevision: 0, value: 'Luna' }])
    await push([{ key: '/name', baseRevision: 0, value: 'Kept' }], 'other')

    await store.deleteAllForUser('owner')
    await store.deleteAllForUser('owner')

    expect(await list()).toEqual([{ id: 'doc', revision: 1, deletedAt: expect.any(String), fields: [] }])
    expect((await list('other'))[0].fields).toEqual([{ key: '/name', revision: 1, value: 'Kept' }])
  })

  describe('history and snapshots', () => {
    it('lists a past revision and reads its content from a snapshot', async () => {
      await push([{ key: '/name', baseRevision: 0, value: 'Luna' }])
      await push([{ key: '/name', baseRevision: 1, value: 'Nova' }])

      const history = await store.history('owner', 'doc', { limit: 50 })
      expect(history).toEqual([
        { revision: 2, at: expect.any(String), changed: ['/name'], removed: [] },
        { revision: 1, at: expect.any(String), changed: ['/name'], removed: [] },
      ])

      expect(await store.snapshot('owner', 'doc', 1)).toEqual({
        revision: 1,
        at: expect.any(String),
        fields: [{ key: '/name', value: 'Luna' }],
      })
    })

    it('keeps a removed field out of the current content but in an old snapshot, and the removal does not conflict', async () => {
      await push([{ key: '/name', baseRevision: 0, value: 'Luna' }, { key: '/nickname', baseRevision: 0, value: 'Lu' }])
      await push([{ key: '/nickname', baseRevision: 1, removed: true }])

      expect((await list())[0].fields).toEqual([{ key: '/name', revision: 1, value: 'Luna' }])
      expect(await store.snapshot('owner', 'doc', 1)).toMatchObject({
        fields: expect.arrayContaining([{ key: '/nickname', value: 'Lu' }]),
      })

      // The removed row never counts as a base revision, so pushing against revision 0 still succeeds.
      const restored = await push([{ key: '/nickname', baseRevision: 0, value: 'Lulu' }])
      expect(restored.conflicts).toEqual([])
    })

    it('reads the content before a deletion from a snapshot, then restores it', async () => {
      await push([{ key: '/name', baseRevision: 0, value: 'Luna' }])
      await store.remove('owner', 'doc', 1)

      expect((await list())[0].fields).toEqual([])
      expect(await store.snapshot('owner', 'doc', 1)).toEqual({
        revision: 1,
        at: expect.any(String),
        fields: [{ key: '/name', value: 'Luna' }],
      })

      const restored = await push([{ key: '/name', baseRevision: 0, value: 'Luna' }])
      expect(restored.document.fields).toEqual([{ key: '/name', revision: 3, value: 'Luna' }])
    })

    it('returns null for another user, a future revision, and a document that does not exist', async () => {
      await push([{ key: '/name', baseRevision: 0, value: 'Luna' }])

      expect(await store.history('owner', 'missing', { limit: 50 })).toBeNull()
      expect(await store.history('other', 'doc', { limit: 50 })).toBeNull()
      expect(await store.snapshot('owner', 'doc', 99)).toBeNull()
      expect(await store.snapshot('other', 'doc', 1)).toBeNull()
    })

    it('pages history with before and limit', async () => {
      for (let i = 0; i < 5; i++)
        await push([{ key: '/name', baseRevision: i, value: `v${i}` }])

      const page = await store.history('owner', 'doc', { limit: 2 })
      expect(page?.map(entry => entry.revision)).toEqual([5, 4])

      const nextPage = await store.history('owner', 'doc', { before: 4, limit: 2 })
      expect(nextPage?.map(entry => entry.revision)).toEqual([3, 2])
    })
  })

  describe('history cleanup', () => {
    const withHistory = (history: FieldSyncHistoryOptions) =>
      createFieldSyncStore(db, { documents, fields }, { history })

    it('keeps a snapshot at the retained revision identical after it collapses older revisions', async () => {
      const limited = withHistory({ revisionsPerKey: 3, deletedDocumentRetentionMs: 1000 * 60 * 60 * 24, maxHistoryBytes: 1024 * 1024 })
      const pushTo = (fields: PushedField[]) => limited.push('owner', 'doc', fields)

      // '/untouched' changes once and never again, '/name' changes every push.
      await pushTo([{ key: '/untouched', baseRevision: 0, value: 'base' }, { key: '/name', baseRevision: 0, value: 'v0' }])
      for (let i = 1; i < 10; i++)
        await pushTo([{ key: '/name', baseRevision: i, value: `v${i}` }])

      const current = await limited.history('owner', 'doc', { limit: 1 })
      const currentRevision = current![0].revision

      const beforeCleanupSnapshot = { revision: currentRevision - 3, fields: expect.arrayContaining([{ key: '/untouched', value: 'base' }, { key: '/name', value: `v${currentRevision - 3 - 1}` }]) }
      expect(await limited.snapshot('owner', 'doc', currentRevision - 3)).toMatchObject(beforeCleanupSnapshot)

      await pushTo([{ key: '/name', baseRevision: currentRevision, value: 'latest' }])

      // The oldest kept snapshot still has the untouched field and its own correct value.
      const oldestKept = currentRevision + 1 - 3
      const snapshot = await limited.snapshot('owner', 'doc', oldestKept)
      expect(snapshot).not.toBeNull()
      expect(snapshot!.fields).toEqual(expect.arrayContaining([{ key: '/untouched', value: 'base' }]))
    })

    // Found in the review of https://github.com/moeru-ai/airi/pull/2817
    // ROOT CAUSE:
    //
    // The baseline query filtered `value is not null` before `DISTINCT ON`.
    // Cleanup then deleted a removal row and kept the older value.
    //
    // We fixed this by picking the latest row of each key first.
    it('does not bring back a removed field when it collapses older revisions', async () => {
      const limited = withHistory({ revisionsPerKey: 3, deletedDocumentRetentionMs: 1000 * 60 * 60 * 24, maxHistoryBytes: 1024 * 1024 })
      const pushTo = (fields: PushedField[]) => limited.push('owner', 'doc', fields)

      await pushTo([{ key: '/nickname', baseRevision: 0, value: 'Lulu' }, { key: '/name', baseRevision: 0, value: 'v0' }])
      await pushTo([{ key: '/nickname', baseRevision: 1, removed: true }])
      let nameRevision = 1
      for (let i = 1; i < 6; i++) {
        const pushed = await pushTo([{ key: '/name', baseRevision: nameRevision, value: `v${i}` }])
        nameRevision = pushed.document.revision
      }

      const document = (await limited.list('owner')).documents[0]
      expect(document.fields.map(field => field.key)).toEqual(['/name'])
    })

    it('removes the history of a deleted document after its retention window, keeping the deletion marker', async () => {
      const limited = withHistory({ revisionsPerKey: 100, deletedDocumentRetentionMs: 0, maxHistoryBytes: 1024 * 1024 })
      await limited.push('owner', 'doc', [{ key: '/name', baseRevision: 0, value: 'Luna' }])
      await limited.remove('owner', 'doc', 1)

      // A second push against another document runs the cleanup pass again, now past the zero-length retention window.
      await limited.push('owner', 'other', [{ key: '/name', baseRevision: 0, value: 'Nova' }])

      expect(await limited.history('owner', 'doc', { limit: 50 })).toEqual([])
      expect((await limited.list('owner')).documents.find(document => document.id === 'doc')).toMatchObject({ deletedAt: expect.any(String) })
    })

    it('never discards the current value of a field to enforce the total history byte cap', async () => {
      const limited = withHistory({ revisionsPerKey: 100, deletedDocumentRetentionMs: 1000 * 60 * 60 * 24, maxHistoryBytes: 200 })
      const pushTo = (fields: PushedField[]) => limited.push('owner', 'doc', fields)
      const valueAt = (i: number) => `${i}`.padStart(50, 'x')

      for (let i = 0; i < 10; i++)
        await pushTo([{ key: '/name', baseRevision: i, value: valueAt(i) }])

      const documents = (await limited.list('owner')).documents
      expect(documents[0].fields).toEqual([{ key: '/name', revision: 10, value: valueAt(9) }])
    })
  })

  it('does not count history bytes toward the storage limit', async () => {
    const limited = createFieldSyncStore(db, { documents, fields }, {
      limits: { maxDocuments: 10, maxBytes: 200 },
      history: { revisionsPerKey: 100, deletedDocumentRetentionMs: 1000 * 60 * 60 * 24, maxHistoryBytes: 1024 * 1024 },
    })
    const pushTo = (fields: PushedField[]) => limited.push('owner', 'doc', fields)
    const valueAt = (i: number) => `${i}`.padStart(50, 'x')

    for (let i = 0; i < 10; i++)
      await expect(pushTo([{ key: '/name', baseRevision: i, value: valueAt(i) }])).resolves.toMatchObject({ conflicts: [] })
  })

  it('removes history rows of a deleted account', async () => {
    const limited = createFieldSyncStore(db, { documents, fields }, {
      history: { revisionsPerKey: 100, deletedDocumentRetentionMs: 1000 * 60 * 60 * 24, maxHistoryBytes: 1024 * 1024 },
    })
    await limited.push('owner', 'doc', [{ key: '/name', baseRevision: 0, value: 'Luna' }])
    await limited.push('owner', 'doc', [{ key: '/name', baseRevision: 1, value: 'Nova' }])

    await limited.deleteAllForUser('owner')

    expect(await limited.history('owner', 'doc', { limit: 50 })).toEqual([])
  })
})

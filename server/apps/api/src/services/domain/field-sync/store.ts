import type { Database } from '../../../libs/db'
import type { PushedField } from './request'
import type { FieldSyncTables } from './tables'

import { Buffer } from 'node:buffer'
import { isDeepStrictEqual } from 'node:util'

import { and, desc, eq, getTableName, inArray, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm'

import { createConflictError, createPayloadTooLargeError } from '../../../utils/error'

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/** What one account can store in the tables of a feature. */
export interface FieldSyncLimits {
  /** The most documents that are not deleted. A deletion marker does not count. */
  maxDocuments: number
  /** The most bytes of field values, as JSON text. Only the current value of each field counts. */
  maxBytes: number
}

/**
 * How long a feature keeps the history that `history` and `snapshot` read.
 * The store prunes history after every accepted write, so a feature needs no
 * background job for it.
 */
export interface FieldSyncHistoryOptions {
  /**
   * Revisions to keep for one field key, counting its current value. Older
   * revisions collapse into one row, so `snapshot` can still find the value
   * that the field had at the oldest kept revision.
   */
  revisionsPerKey: number
  /** Milliseconds a deleted document's field rows survive before the store removes them. */
  deletedDocumentRetentionMs: number
  /**
   * Total bytes of field rows, current and past, that one account may store.
   * Past the limit, the store removes the oldest rows first. The current
   * value of a field never counts as removable.
   */
  maxHistoryBytes: number
}

export interface FieldSyncStoreOptions {
  /**
   * Checks the fields of a push before the store writes them. Throw an
   * `ApiError` to reject the push. The store does not read field values, so
   * the feature owns every rule about their content.
   */
  validate?: (fields: PushedField[]) => void
  /**
   * Rejects a push with 413 when it makes the account exceed a limit. A push
   * that keeps the account at or below its earlier usage always passes, so an
   * account over its limit can still delete and shrink.
   *
   * The store checks inside the write transaction under a lock for the
   * account. Two requests cannot both pass on the last free slot.
   */
  limits?: FieldSyncLimits
  /** Keeps the history that `history` and `snapshot` read. Omit it to keep no history beyond the current value. */
  history?: FieldSyncHistoryOptions
}

/** One past change to a document, the keys it set and the keys it removed. */
export interface FieldSyncHistoryEntry {
  revision: number
  at: string
  changed: string[]
  removed: string[]
}

/** The content of a document at a past revision. */
export interface FieldSyncSnapshot {
  revision: number
  at: string
  fields: Array<{ key: string, value: unknown }>
}

/**
 * Stores the documents of one feature that a user edits on many devices.
 *
 * A document is a set of independent fields. Devices that change different
 * fields of one document do not conflict. A device that changes a field from
 * an old revision receives a conflict for that field only.
 *
 * A field table only appends rows. Each row is the value that a field had at
 * one revision, and a `null` value means that the revision removed the
 * field. The current value of a field is its row with the highest revision.
 * A deleted field never takes part in a conflict check, the same as a field
 * that never existed, so its removal always keeps `baseRevision` at zero.
 *
 * The store owns the locking, the revisions, the deletion markers, and the
 * history. The feature owns its tables, its routes, and every rule about the
 * content.
 */
export function createFieldSyncStore(db: Database, tables: FieldSyncTables, options: FieldSyncStoreOptions = {}) {
  const { documents, fields } = tables

  function toWireDocument(document: typeof documents.$inferSelect, rows: Array<{ key: string, revision: number, value: unknown }>) {
    return {
      id: document.documentId,
      revision: document.revision,
      deletedAt: document.deletedAt?.toISOString() ?? null,
      fields: rows.map(row => ({ key: row.key, revision: row.revision, value: row.value })),
    }
  }

  /** Every query filters by the owner, so a user cannot reach the documents of another user. */
  function documentFilter(ownerId: string, documentId: string) {
    return and(eq(documents.ownerId, ownerId), eq(documents.documentId, documentId))
  }

  function fieldsFilter(ownerId: string, documentId: string) {
    return and(eq(fields.ownerId, ownerId), eq(fields.documentId, documentId))
  }

  /** The current row of every key of a document, including a key that is currently removed. */
  function currentFieldsOfDocument(tx: Transaction, ownerId: string, documentId: string) {
    return tx.selectDistinctOn([fields.key])
      .from(fields)
      .where(fieldsFilter(ownerId, documentId))
      .orderBy(fields.key, desc(fields.revision))
  }

  /** The current row of every key of every document of an account, including a currently removed key. */
  function currentFieldsOfOwner(tx: Transaction, ownerId: string) {
    return tx.selectDistinctOn([fields.documentId, fields.key])
      .from(fields)
      .where(eq(fields.ownerId, ownerId))
      .orderBy(fields.documentId, fields.key, desc(fields.revision))
  }

  function jsonByteLength(value: unknown) {
    return Buffer.byteLength(JSON.stringify(value), 'utf8')
  }

  /**
   * Serializes the pushes of one account, so the limit check and the writes
   * form one step. The lock lasts until the transaction ends.
   */
  async function lockAccount(tx: Transaction, ownerId: string) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${getTableName(documents)}:${ownerId}`}, 0))`)
  }

  async function measureUsage(tx: Transaction, ownerId: string) {
    const [live] = await tx.select({ count: sql<number>`count(*)::int` }).from(documents).where(and(eq(documents.ownerId, ownerId), isNull(documents.deletedAt)))
    const current = await currentFieldsOfOwner(tx, ownerId)
    const bytes = current.reduce((sum, row) => row.value === null ? sum : sum + jsonByteLength(row.value), 0)
    return { documents: live.count, bytes }
  }

  /**
   * Serializes all writers of one document. Every write path takes this lock
   * before it reads a revision, so two devices cannot accept the same base revision.
   */
  async function lockDocument(tx: Transaction, ownerId: string, documentId: string) {
    const [document] = await tx.select().from(documents).where(documentFilter(ownerId, documentId)).for('update')
    return document
  }

  /**
   * Collapses the rows of a document that a revision cutoff makes old. Each
   * key keeps only its latest row at or below the cutoff, and only when that
   * row has a value. A key whose latest row at or below the cutoff is a
   * removal keeps nothing there, because the key did not exist going forward
   * from that point.
   */
  async function compactFieldHistory(tx: Transaction, ownerId: string, documentId: string, cutoff: number) {
    if (cutoff <= 0)
      return

    // Pick the latest row of each key first, then drop the removals. A filter
    // on the value before `DISTINCT ON` picks an older value instead of the
    // removal, and the removed key becomes current again.
    const baseline = await tx.selectDistinctOn([fields.key], { key: fields.key, revision: fields.revision, removed: sql<boolean>`${fields.value} is null` })
      .from(fields)
      .where(and(fieldsFilter(ownerId, documentId), lte(fields.revision, cutoff)))
      .orderBy(fields.key, desc(fields.revision))
    const keptRevisionByKey = new Map(baseline.filter(row => !row.removed).map(row => [row.key, row.revision]))

    const old = await tx.select({ key: fields.key, revision: fields.revision })
      .from(fields)
      .where(and(fieldsFilter(ownerId, documentId), lte(fields.revision, cutoff)))
    const stale = old.filter(row => keptRevisionByKey.get(row.key) !== row.revision)
    if (stale.length === 0)
      return

    await tx.delete(fields).where(and(
      fieldsFilter(ownerId, documentId),
      lte(fields.revision, cutoff),
      or(...stale.map(row => and(eq(fields.key, row.key), eq(fields.revision, row.revision)))),
    ))
  }

  /** Removes the field rows of a document that stayed deleted past the retention window. */
  async function purgeDeletedDocuments(tx: Transaction, ownerId: string, retentionMs: number) {
    const cutoff = new Date(Date.now() - retentionMs)
    const stale = await tx.select({ documentId: documents.documentId }).from(documents).where(and(eq(documents.ownerId, ownerId), isNotNull(documents.deletedAt), lt(documents.deletedAt, cutoff)))
    if (stale.length === 0)
      return

    await tx.delete(fields).where(and(eq(fields.ownerId, ownerId), inArray(fields.documentId, stale.map(row => row.documentId))))
  }

  /**
   * Removes the oldest history rows of an account until its stored bytes fit
   * the limit. A row that is the current value of its field never counts as
   * removable, so a push never fails because its own account carries too
   * much history.
   */
  async function enforceHistoryByteCap(tx: Transaction, ownerId: string, maxBytes: number) {
    const [{ bytes: totalBytes }] = await tx.select({ bytes: sql<number>`coalesce(sum(octet_length(${fields.value}::text)), 0)::int` })
      .from(fields)
      .where(eq(fields.ownerId, ownerId))
    if (totalBytes <= maxBytes)
      return

    const current = await currentFieldsOfOwner(tx, ownerId)
    const protectedKeys = new Set(current.map(row => `${row.documentId}\u0000${row.key}\u0000${row.revision}`))

    const candidates = await tx.select({
      documentId: fields.documentId,
      key: fields.key,
      revision: fields.revision,
      bytes: sql<number>`octet_length(${fields.value}::text)::int`,
    }).from(fields).where(eq(fields.ownerId, ownerId)).orderBy(fields.revision)

    let remaining = totalBytes
    const toDelete: Array<{ documentId: string, key: string, revision: number }> = []
    for (const row of candidates) {
      if (remaining <= maxBytes)
        break
      if (protectedKeys.has(`${row.documentId}\u0000${row.key}\u0000${row.revision}`))
        continue
      toDelete.push(row)
      remaining -= row.bytes
    }
    if (toDelete.length === 0)
      return

    await tx.delete(fields).where(and(
      eq(fields.ownerId, ownerId),
      or(...toDelete.map(row => and(eq(fields.documentId, row.documentId), eq(fields.key, row.key), eq(fields.revision, row.revision)))),
    ))
  }

  async function pruneHistory(tx: Transaction, ownerId: string, documentId: string, revision: number) {
    const { history } = options
    if (!history)
      return

    await compactFieldHistory(tx, ownerId, documentId, revision - history.revisionsPerKey)
    await purgeDeletedDocuments(tx, ownerId, history.deletedDocumentRetentionMs)
    await enforceHistoryByteCap(tx, ownerId, history.maxHistoryBytes)
  }

  return {
    /** Returns all documents of the user, including the markers of deleted documents. */
    async list(ownerId: string) {
      // One snapshot keeps each document revision consistent with its field rows.
      return db.transaction(async (tx) => {
        const documentRows = await tx.select().from(documents).where(eq(documents.ownerId, ownerId))
        const fieldRows = (await currentFieldsOfOwner(tx, ownerId)).filter(row => row.value !== null)

        const rowsByDocument = Map.groupBy(fieldRows, row => row.documentId)
        return {
          documents: documentRows.map(document => toWireDocument(document, rowsByDocument.get(document.documentId) ?? [])),
        }
      }, { isolationLevel: 'repeatable read' })
    },

    /**
     * Applies each pushed field whose base revision is current.
     *
     * A push to a deleted document restores the document when the store
     * accepts a field. An edit has priority over a deletion from another device.
     *
     * @returns The stored document after the write, and the keys that another device changed first.
     */
    async push(ownerId: string, documentId: string, pushed: PushedField[]) {
      options.validate?.(pushed)

      return db.transaction(async (tx) => {
        const { limits } = options
        if (limits)
          await lockAccount(tx, ownerId)
        const usageBefore = limits && await measureUsage(tx, ownerId)

        await tx.insert(documents).values({ ownerId, documentId }).onConflictDoNothing()
        const document = (await lockDocument(tx, ownerId, documentId))!

        const stored = await currentFieldsOfDocument(tx, ownerId, documentId)
        const current = new Map(stored.filter(row => row.value !== null).map(row => [row.key, { key: row.key, revision: row.revision, value: row.value }]))
        const revision = document.revision + 1
        const now = new Date()
        const conflicts: string[] = []
        const toInsert = new Map<string, typeof fields.$inferInsert>()

        for (const field of pushed) {
          const row = current.get(field.key)
          const isRemoval = 'removed' in field

          // A retried push, or two devices that made the same change, need no write.
          const hasSameContent = isRemoval
            ? !row
            : !!row && isDeepStrictEqual(row.value, field.value)
          if (hasSameContent)
            continue

          if ((row?.revision ?? 0) !== field.baseRevision) {
            conflicts.push(field.key)
            continue
          }

          if (isRemoval) {
            toInsert.set(field.key, { ownerId, documentId, key: field.key, value: null, revision, updatedAt: now })
            current.delete(field.key)
            continue
          }

          toInsert.set(field.key, { ownerId, documentId, key: field.key, value: field.value, revision, updatedAt: now })
          current.set(field.key, { key: field.key, revision, value: field.value })
        }

        if (toInsert.size === 0) {
          // The insert above created an empty document. A document without
          // fields is not valid for other devices, so remove it again.
          if (document.revision === 0)
            await tx.delete(documents).where(documentFilter(ownerId, documentId))
          return { document: toWireDocument(document, [...current.values()]), conflicts }
        }

        await tx.insert(fields).values([...toInsert.values()])

        if (limits && usageBefore) {
          const usageAfter = await measureUsage(tx, ownerId)
          const grewPastDocuments = usageAfter.documents > limits.maxDocuments && usageAfter.documents > usageBefore.documents
          const grewPastBytes = usageAfter.bytes > limits.maxBytes && usageAfter.bytes > usageBefore.bytes
          // The error rolls back every write of this push.
          if (grewPastDocuments || grewPastBytes)
            throw createPayloadTooLargeError('Storage limit reached', 'STORAGE_LIMIT_EXCEEDED', { limits, usage: usageAfter })
        }

        const [updated] = await tx.update(documents)
          .set({ revision, updatedAt: now, deletedAt: null })
          .where(documentFilter(ownerId, documentId))
          .returning()

        await pruneHistory(tx, ownerId, documentId, revision)

        return { document: toWireDocument(updated, [...current.values()]), conflicts }
      })
    },

    /**
     * Marks a document as deleted and removes its content.
     *
     * The deletion fails with a conflict when another device changed the
     * document after `revision`. That device's edit has priority.
     */
    async remove(ownerId: string, documentId: string, revision: number) {
      await db.transaction(async (tx) => {
        const document = await lockDocument(tx, ownerId, documentId)
        // A retried deletion, or a document that never reached the server, needs no write.
        if (!document || document.deletedAt)
          return
        if (document.revision !== revision)
          throw createConflictError('Another device changed the document', { revision: document.revision })

        const now = new Date()
        const nextRevision = document.revision + 1
        const live = (await currentFieldsOfDocument(tx, ownerId, documentId)).filter(row => row.value !== null)
        if (live.length > 0) {
          await tx.insert(fields).values(live.map(row => ({ ownerId, documentId, key: row.key, value: null, revision: nextRevision, updatedAt: now })))
        }
        await tx.update(documents)
          .set({ revision: nextRevision, updatedAt: now, deletedAt: now })
          .where(documentFilter(ownerId, documentId))

        await pruneHistory(tx, ownerId, documentId, nextRevision)
      })
    },

    /**
     * Removes the document content of a deleted account, current and past. The
     * document rows stay as deletion markers, the same as after a deletion by
     * the user. A retry finds no content and changes nothing.
     */
    async deleteAllForUser(ownerId: string) {
      await db.transaction(async (tx) => {
        const now = new Date()
        await tx.delete(fields).where(eq(fields.ownerId, ownerId))
        await tx.update(documents)
          .set({ updatedAt: now, deletedAt: now })
          .where(and(eq(documents.ownerId, ownerId), isNull(documents.deletedAt)))
      })
    },

    /**
     * Returns the past revisions of a document, newest first.
     *
     * @returns `null` when the document does not exist or belongs to another user.
     */
    async history(ownerId: string, documentId: string, { before, limit }: { before?: number, limit: number }): Promise<FieldSyncHistoryEntry[] | null> {
      const [document] = await db.select().from(documents).where(documentFilter(ownerId, documentId))
      if (!document)
        return null

      const revisionRows = await db.selectDistinct({ revision: fields.revision })
        .from(fields)
        .where(and(fieldsFilter(ownerId, documentId), before !== undefined ? lt(fields.revision, before) : undefined))
        .orderBy(desc(fields.revision))
        .limit(limit)
      const revisions = revisionRows.map(row => row.revision)
      if (revisions.length === 0)
        return []

      const rows = await db.select().from(fields).where(and(fieldsFilter(ownerId, documentId), inArray(fields.revision, revisions)))
      const byRevision = Map.groupBy(rows, row => row.revision)

      return revisions.map((revision) => {
        const changes = byRevision.get(revision) ?? []
        return {
          revision,
          at: changes[0]!.updatedAt.toISOString(),
          changed: changes.filter(row => row.value !== null).map(row => row.key),
          removed: changes.filter(row => row.value === null).map(row => row.key),
        }
      })
    },

    /**
     * Returns the content of a document at a past revision.
     *
     * @returns `null` when the document does not exist, the revision is newer
     * than the document's current revision, or the history cleanup already
     * removed that revision.
     */
    async snapshot(ownerId: string, documentId: string, revision: number): Promise<FieldSyncSnapshot | null> {
      const [document] = await db.select().from(documents).where(documentFilter(ownerId, documentId))
      if (!document || revision > document.revision)
        return null

      const [marker] = await db.select({ updatedAt: fields.updatedAt }).from(fields).where(and(fieldsFilter(ownerId, documentId), eq(fields.revision, revision))).limit(1)
      if (!marker)
        return null

      const rows = await db.selectDistinctOn([fields.key])
        .from(fields)
        .where(and(fieldsFilter(ownerId, documentId), lte(fields.revision, revision)))
        .orderBy(fields.key, desc(fields.revision))

      return {
        revision,
        at: marker.updatedAt.toISOString(),
        fields: rows.filter(row => row.value !== null).map(row => ({ key: row.key, value: row.value })),
      }
    },
  }
}

export type FieldSyncStore = ReturnType<typeof createFieldSyncStore>

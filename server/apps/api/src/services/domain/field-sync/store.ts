import type { Database } from '../../../libs/db'
import type { PushedField } from './request'
import type { FieldSyncTables } from './tables'

import { isDeepStrictEqual } from 'node:util'

import { and, eq, getTableName, isNull, sql } from 'drizzle-orm'

import { createConflictError, createPayloadTooLargeError } from '../../../utils/error'

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/** What one account can store in the tables of a feature. */
export interface FieldSyncLimits {
  /** The most documents that are not deleted. A deletion marker does not count. */
  maxDocuments: number
  /** The most bytes of field values, as JSON text. */
  maxBytes: number
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
}

/**
 * Stores the documents of one feature that a user edits on many devices.
 *
 * A document is a set of independent fields. Devices that change different
 * fields of one document do not conflict. A device that changes a field from
 * an old revision receives a conflict for that field only.
 *
 * The store owns the locking, the revisions, and the deletion markers. The
 * feature owns its tables, its routes, and every rule about the content.
 * The tables must have the columns that {@link FieldSyncTables} describes.
 */
export function createFieldSyncStore(db: Database, tables: FieldSyncTables, options: FieldSyncStoreOptions = {}) {
  const { documents, fields } = tables

  function toWireDocument(document: typeof documents.$inferSelect, rows: Array<typeof fields.$inferSelect>) {
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

  /**
   * Serializes the pushes of one account, so the limit check and the writes
   * form one step. The lock lasts until the transaction ends.
   */
  async function lockAccount(tx: Transaction, ownerId: string) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${getTableName(documents)}:${ownerId}`}, 0))`)
  }

  async function measureUsage(tx: Transaction, ownerId: string) {
    const [live] = await tx.select({ count: sql<number>`count(*)::int` }).from(documents).where(and(eq(documents.ownerId, ownerId), isNull(documents.deletedAt)))
    const [stored] = await tx.select({ bytes: sql<number>`coalesce(sum(octet_length(${fields.value}::text)), 0)::int` }).from(fields).where(eq(fields.ownerId, ownerId))
    return { documents: live.count, bytes: stored.bytes }
  }

  /**
   * Serializes all writers of one document. Every write path takes this lock
   * before it reads a revision, so two devices cannot accept the same base revision.
   */
  async function lockDocument(tx: Transaction, ownerId: string, documentId: string) {
    const [document] = await tx.select().from(documents).where(documentFilter(ownerId, documentId)).for('update')
    return document
  }

  return {
    /** Returns all documents of the user, including the markers of deleted documents. */
    async list(ownerId: string) {
      // One snapshot keeps each document revision consistent with its field rows.
      return db.transaction(async (tx) => {
        const documentRows = await tx.select().from(documents).where(eq(documents.ownerId, ownerId))
        const fieldRows = await tx.select().from(fields).where(eq(fields.ownerId, ownerId))

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

        const stored = await tx.select().from(fields).where(fieldsFilter(ownerId, documentId))
        const current = new Map(stored.map(row => [row.key, row]))
        const revision = document.revision + 1
        const now = new Date()
        const conflicts: string[] = []
        let accepted = 0

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

          accepted += 1
          if (isRemoval) {
            await tx.delete(fields).where(and(fieldsFilter(ownerId, documentId), eq(fields.key, field.key)))
            current.delete(field.key)
            continue
          }

          const [written] = await tx.insert(fields)
            .values({ ownerId, documentId, key: field.key, value: field.value, revision, updatedAt: now })
            .onConflictDoUpdate({
              target: [fields.ownerId, fields.documentId, fields.key],
              set: { value: field.value, revision, updatedAt: now },
            })
            .returning()
          current.set(field.key, written)
        }

        if (accepted === 0) {
          // The insert above created an empty document. A document without
          // fields is not valid for other devices, so remove it again.
          if (document.revision === 0)
            await tx.delete(documents).where(documentFilter(ownerId, documentId))
          return { document: toWireDocument(document, [...current.values()]), conflicts }
        }

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
        await tx.delete(fields).where(fieldsFilter(ownerId, documentId))
        await tx.update(documents)
          .set({ revision: document.revision + 1, updatedAt: now, deletedAt: now })
          .where(documentFilter(ownerId, documentId))
      })
    },

    /**
     * Removes the document content of a deleted account. The document rows
     * stay as deletion markers, the same as after a deletion by the user. A
     * retry finds no content and changes nothing.
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
  }
}

export type FieldSyncStore = ReturnType<typeof createFieldSyncStore>

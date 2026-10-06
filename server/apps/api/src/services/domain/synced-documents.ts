import type { Database } from '../../libs/db'
import type { Collection, PushedField } from '../../routes/sync/schema'
import type { SyncedDocument, SyncedDocumentField } from '../../schemas/synced-documents'

import { isDeepStrictEqual } from 'node:util'

import { and, eq, isNull } from 'drizzle-orm'

import { createConflictError } from '../../utils/error'

import * as schema from '../../schemas/synced-documents'

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/** Identifies one document. All queries filter by the owner, so a user cannot reach the documents of another user. */
interface DocumentRef {
  ownerId: string
  collection: Collection
  documentId: string
}

function toWireDocument(document: SyncedDocument, fields: SyncedDocumentField[]) {
  return {
    id: document.documentId,
    revision: document.revision,
    deletedAt: document.deletedAt?.toISOString() ?? null,
    fields: fields.map(field => ({ key: field.key, revision: field.revision, value: field.value })),
  }
}

function documentFilter(ref: DocumentRef) {
  return and(
    eq(schema.syncedDocuments.ownerId, ref.ownerId),
    eq(schema.syncedDocuments.collection, ref.collection),
    eq(schema.syncedDocuments.documentId, ref.documentId),
  )
}

function fieldsFilter(ref: DocumentRef) {
  return and(
    eq(schema.syncedDocumentFields.ownerId, ref.ownerId),
    eq(schema.syncedDocumentFields.collection, ref.collection),
    eq(schema.syncedDocumentFields.documentId, ref.documentId),
  )
}

/**
 * Serializes all writers of one document. Every write path takes this lock
 * before it reads a revision, so two devices cannot accept the same base revision.
 */
async function lockDocument(tx: Transaction, ref: DocumentRef) {
  const [document] = await tx.select().from(schema.syncedDocuments).where(documentFilter(ref)).for('update')
  return document
}

/**
 * Stores the documents that a user synchronizes between devices.
 *
 * A document is a set of independent fields. Devices that change different
 * fields of one document do not conflict. A device that changes a field from
 * an old revision receives a conflict for that field only.
 */
export function createSyncedDocumentService(db: Database) {
  return {
    /** Returns all documents of the user in one collection, including the markers of deleted documents. */
    async list(ownerId: string, collection: Collection) {
      // One snapshot keeps each document revision consistent with its field rows.
      return db.transaction(async (tx) => {
        const documents = await tx.select().from(schema.syncedDocuments).where(and(
          eq(schema.syncedDocuments.ownerId, ownerId),
          eq(schema.syncedDocuments.collection, collection),
        ))
        const fields = await tx.select().from(schema.syncedDocumentFields).where(and(
          eq(schema.syncedDocumentFields.ownerId, ownerId),
          eq(schema.syncedDocumentFields.collection, collection),
        ))

        return {
          documents: documents.map(document => toWireDocument(document, fields.filter(field => field.documentId === document.documentId))),
        }
      }, { isolationLevel: 'repeatable read' })
    },

    /**
     * Applies each pushed field whose base revision is current.
     *
     * A push to a deleted document restores the document when the server
     * accepts a field. An edit has priority over a deletion from another device.
     *
     * @returns The stored document after the write, and the keys that another device changed first.
     */
    async push(ref: DocumentRef, pushed: PushedField[]) {
      return db.transaction(async (tx) => {
        await tx.insert(schema.syncedDocuments).values(ref).onConflictDoNothing()
        const document = (await lockDocument(tx, ref))!

        const stored = await tx.select().from(schema.syncedDocumentFields).where(fieldsFilter(ref))
        const fields = new Map(stored.map(field => [field.key, field]))
        const revision = document.revision + 1
        const now = new Date()
        const conflicts: string[] = []
        let accepted = 0

        for (const field of pushed) {
          const current = fields.get(field.key)
          const isRemoval = 'removed' in field

          // A retried push, or two devices that made the same change, need no write.
          const hasSameContent = isRemoval
            ? !current
            : !!current && isDeepStrictEqual(current.value, field.value)
          if (hasSameContent)
            continue

          if ((current?.revision ?? 0) !== field.baseRevision) {
            conflicts.push(field.key)
            continue
          }

          accepted += 1
          if (isRemoval) {
            await tx.delete(schema.syncedDocumentFields).where(and(fieldsFilter(ref), eq(schema.syncedDocumentFields.key, field.key)))
            fields.delete(field.key)
            continue
          }

          const [row] = await tx.insert(schema.syncedDocumentFields)
            .values({ ...ref, key: field.key, value: field.value, revision, updatedAt: now })
            .onConflictDoUpdate({
              target: [
                schema.syncedDocumentFields.ownerId,
                schema.syncedDocumentFields.collection,
                schema.syncedDocumentFields.documentId,
                schema.syncedDocumentFields.key,
              ],
              set: { value: field.value, revision, updatedAt: now },
            })
            .returning()
          fields.set(field.key, row)
        }

        if (accepted === 0) {
          // The insert above created an empty document. A document without
          // fields is not valid for other devices, so remove it again.
          if (document.revision === 0)
            await tx.delete(schema.syncedDocuments).where(documentFilter(ref))
          return { document: toWireDocument(document, [...fields.values()]), conflicts }
        }

        const [updated] = await tx.update(schema.syncedDocuments)
          .set({ revision, updatedAt: now, deletedAt: null })
          .where(documentFilter(ref))
          .returning()
        return { document: toWireDocument(updated, [...fields.values()]), conflicts }
      })
    },

    /**
     * Marks a document as deleted and removes its content.
     *
     * The deletion fails with a conflict when another device changed the
     * document after `revision`. That device's edit has priority.
     */
    async remove(ref: DocumentRef, revision: number) {
      await db.transaction(async (tx) => {
        const document = await lockDocument(tx, ref)
        // A retried deletion, or a document that never reached the server, needs no write.
        if (!document || document.deletedAt)
          return
        if (document.revision !== revision)
          throw createConflictError('Another device changed the document', { revision: document.revision })

        const now = new Date()
        await tx.delete(schema.syncedDocumentFields).where(fieldsFilter(ref))
        await tx.update(schema.syncedDocuments)
          .set({ revision: document.revision + 1, updatedAt: now, deletedAt: now })
          .where(documentFilter(ref))
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
        await tx.delete(schema.syncedDocumentFields).where(eq(schema.syncedDocumentFields.ownerId, ownerId))
        await tx.update(schema.syncedDocuments)
          .set({ updatedAt: now, deletedAt: now })
          .where(and(eq(schema.syncedDocuments.ownerId, ownerId), isNull(schema.syncedDocuments.deletedAt)))
      })
    },
  }
}

export type SyncedDocumentService = ReturnType<typeof createSyncedDocumentService>

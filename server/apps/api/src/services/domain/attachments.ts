import type { Database } from '../../libs/db'
import type { AttachmentObjectStore } from '../adapters/attachment-object-store'

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { createConflictError, createNotFoundError, createServiceUnavailableError } from '../../utils/error'

import * as schema from '../../schemas'

export interface CreateAttachmentInput {
  id: string
  mimeType: string
  sha256: string
  size: number
}

export interface AttachmentDescriptor {
  id: string
  mimeType: string
  size: number
}

/** Owns attachment metadata and its private object-storage lifecycle. */
export function createAttachmentService(db: Database, objectStore: AttachmentObjectStore | null) {
  function requireObjectStore(): AttachmentObjectStore {
    if (!objectStore)
      throw createServiceUnavailableError('Attachment storage is not configured', 'ATTACHMENT_STORAGE_UNAVAILABLE')
    return objectStore
  }

  function descriptor(row: typeof schema.attachments.$inferSelect): AttachmentDescriptor {
    return { id: row.id, mimeType: row.mimeType, size: row.size }
  }

  return {
    async createUpload(userId: string, input: CreateAttachmentInput) {
      const store = requireObjectStore()
      const objectKey = `attachments/${input.id}/original`
      const now = new Date()

      await db.insert(schema.attachments).values({
        ...input,
        objectKey,
        ownerId: userId,
        state: 'pending',
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing()

      const attachment = await db.query.attachments.findFirst({ where: eq(schema.attachments.id, input.id) })
      if (!attachment || attachment.ownerId !== userId)
        throw createNotFoundError('Attachment not found')

      if (
        attachment.mimeType !== input.mimeType
        || attachment.size !== input.size
        || attachment.sha256 !== input.sha256
      ) {
        throw createConflictError('Attachment metadata does not match the existing upload')
      }

      if (attachment.state === 'ready')
        return { attachment: descriptor(attachment), upload: null }

      const upload = await store.createUploadTarget({
        contentType: attachment.mimeType,
        objectKey: attachment.objectKey,
        sha256: attachment.sha256,
      })
      return { attachment: descriptor(attachment), upload }
    },

    async finalizeUpload(userId: string, attachmentId: string) {
      const store = requireObjectStore()
      const attachment = await db.query.attachments.findFirst({
        where: and(eq(schema.attachments.id, attachmentId), eq(schema.attachments.ownerId, userId)),
      })
      if (!attachment)
        throw createNotFoundError('Attachment not found')
      if (attachment.state === 'ready')
        return descriptor(attachment)

      const object = await store.inspectObject(attachment.objectKey)
      if (
        object.size !== attachment.size
        || object.contentType !== attachment.mimeType
        || object.sha256 !== attachment.sha256
      ) {
        throw createConflictError('Uploaded object metadata does not match the attachment')
      }

      const [ready] = await db.update(schema.attachments)
        .set({ state: 'ready', updatedAt: new Date() })
        .where(and(eq(schema.attachments.id, attachmentId), eq(schema.attachments.ownerId, userId)))
        .returning()
      if (!ready)
        throw createNotFoundError('Attachment not found')
      return descriptor(ready)
    },

    async createDownload(userId: string, attachmentId: string) {
      const store = requireObjectStore()
      const attachment = await db.query.attachments.findFirst({
        where: and(eq(schema.attachments.id, attachmentId), eq(schema.attachments.state, 'ready')),
      })
      if (!attachment)
        throw createNotFoundError('Attachment not found')

      if (attachment.ownerId !== userId) {
        const [membership] = await db
          .select({ chatId: schema.chatMembers.chatId })
          .from(schema.chatMembers)
          .innerJoin(schema.chats, eq(schema.chats.id, schema.chatMembers.chatId))
          .innerJoin(schema.messages, eq(schema.messages.chatId, schema.chatMembers.chatId))
          .where(and(
            eq(schema.chatMembers.memberType, 'user'),
            eq(schema.chatMembers.userId, userId),
            isNull(schema.chats.deletedAt),
            isNull(schema.messages.deletedAt),
            sql`${attachmentId} = ANY(${schema.messages.mediaIds})`,
          ))
          .limit(1)
        if (!membership)
          throw createNotFoundError('Attachment not found')
      }

      return {
        attachment: descriptor(attachment),
        url: await store.createDownloadUrl(attachment.objectKey),
      }
    },

    async deleteAllForUser(userId: string) {
      const owned = await db.select().from(schema.attachments).where(eq(schema.attachments.ownerId, userId))
      if (objectStore) {
        await Promise.all(owned.map(attachment => objectStore.deleteObject(attachment.objectKey)))
      }
      if (owned.length > 0) {
        await db.delete(schema.attachments).where(inArray(schema.attachments.id, owned.map(attachment => attachment.id)))
      }
      return owned.length
    },
  }
}

export type AttachmentService = ReturnType<typeof createAttachmentService>

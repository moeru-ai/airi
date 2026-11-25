import type { CreateAttachmentRequest, CreateAttachmentResponse, DownloadAttachmentResponse, WireAttachment } from '@proj-airi/server-sdk-shared/v2'

import type { Database } from '../../libs/db'
import type { Attachment } from '../../schemas/attachments'
import type { ObjectStore } from '../adapters/object-store'

import { createConflictError, createNotFoundError } from '@proj-airi/http-shared'
import { and, arrayContains, eq, inArray, isNull } from 'drizzle-orm'

import { attachments } from '../../schemas/attachments'
import { chatMembers, chats, messages } from '../../schemas/chats'
import { signWriteOnceUpload, uploadedObjectMismatch } from './direct-upload'

function toWireAttachment({ id, mimeType, size, thumbnail }: Attachment): WireAttachment {
  return { id, mimeType, size, ...(thumbnail ? { thumbnail } : {}) }
}

export function createAttachmentService(
  db: Database,
  objectStore: Pick<ObjectStore, 'createDownloadUrl' | 'createUploadTarget' | 'deleteObject' | 'inspectObject'>,
) {
  async function requireOwnedAttachment(userId: string, attachmentId: string) {
    const attachment = await db.query.attachments.findFirst({
      where: and(eq(attachments.id, attachmentId), eq(attachments.ownerId, userId)),
    })
    if (!attachment)
      throw createNotFoundError('Attachment not found')
    return attachment
  }

  return {
    async createUpload(userId: string, input: CreateAttachmentRequest): Promise<CreateAttachmentResponse> {
      await db.insert(attachments).values({
        ...input,
        objectKey: `attachments/${input.id}/original`,
        ownerId: userId,
        state: 'pending',
      }).onConflictDoNothing()

      const attachment = await requireOwnedAttachment(userId, input.id)
      if (
        attachment.mimeType !== input.mimeType
        || attachment.size !== input.size
        || attachment.sha256 !== input.sha256
      ) {
        throw createConflictError('Attachment metadata does not match the existing upload')
      }

      const upload = attachment.state === 'ready'
        ? null
        : await signWriteOnceUpload(objectStore, attachment.objectKey, attachment.mimeType, attachment.sha256)
      return { attachment: toWireAttachment(attachment), upload }
    },

    async finalizeUpload(userId: string, attachmentId: string) {
      const attachment = await requireOwnedAttachment(userId, attachmentId)
      if (attachment.state === 'ready')
        return toWireAttachment(attachment)

      const object = await objectStore.inspectObject(attachment.objectKey)
      const mismatch = uploadedObjectMismatch(object, attachment.size, attachment.sha256, attachment.mimeType)
      if (mismatch)
        throw createConflictError(mismatch)

      const [readyAttachment] = await db.update(attachments)
        .set({ state: 'ready', updatedAt: new Date() })
        .where(and(eq(attachments.id, attachmentId), eq(attachments.ownerId, userId)))
        .returning()
      if (!readyAttachment)
        throw createNotFoundError('Attachment not found')
      return toWireAttachment(readyAttachment)
    },

    async createDownload(userId: string, attachmentId: string): Promise<DownloadAttachmentResponse> {
      const attachment = await db.query.attachments.findFirst({
        where: and(eq(attachments.id, attachmentId), eq(attachments.state, 'ready')),
      })
      if (!attachment)
        throw createNotFoundError('Attachment not found')

      if (attachment.ownerId !== userId) {
        const [membership] = await db
          .select({ chatId: chatMembers.chatId })
          .from(chatMembers)
          .innerJoin(chats, eq(chats.id, chatMembers.chatId))
          .innerJoin(messages, eq(messages.chatId, chatMembers.chatId))
          .where(and(
            eq(chatMembers.memberType, 'user'),
            eq(chatMembers.userId, userId),
            isNull(chats.deletedAt),
            isNull(messages.deletedAt),
            arrayContains(messages.mediaIds, [attachmentId]),
          ))
          .limit(1)
        if (!membership)
          throw createNotFoundError('Attachment not found')
      }

      return {
        attachment: toWireAttachment(attachment),
        sha256: attachment.sha256,
        url: await objectStore.createDownloadUrl(attachment.objectKey),
      }
    },

    async deleteAllForUser(userId: string) {
      const owned = await db.select({ id: attachments.id, objectKey: attachments.objectKey })
        .from(attachments)
        .where(eq(attachments.ownerId, userId))
      await Promise.all(owned.map(attachment => objectStore.deleteObject(attachment.objectKey)))
      if (owned.length > 0)
        await db.delete(attachments).where(inArray(attachments.id, owned.map(attachment => attachment.id)))
    },
  }
}

export type AttachmentService = ReturnType<typeof createAttachmentService>

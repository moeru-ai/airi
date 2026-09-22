import type { Database } from '../../libs/db'
import type { AttachmentObjectStore } from '../adapters/attachment-object-store'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createAttachmentService } from './attachments'

import * as schema from '../../schemas'

function createObjectStore(): AttachmentObjectStore {
  return {
    createDownloadUrl: vi.fn(async objectKey => `https://objects.test/${objectKey}`),
    createUploadTarget: vi.fn(async () => ({
      headers: { 'content-type': 'image/png', 'x-amz-meta-sha256': 'a'.repeat(64) },
      url: 'https://objects.test/upload',
    })),
    deleteObject: vi.fn(async () => undefined),
    inspectObject: vi.fn(async () => ({
      contentType: 'image/png',
      sha256: 'a'.repeat(64),
      size: 4,
    })),
  }
}

describe('attachment service', () => {
  let db: Database
  let objectStore: AttachmentObjectStore

  beforeEach(async () => {
    db = await mockDB(schema)
    objectStore = createObjectStore()
  })

  it('creates a private upload and marks it ready after object metadata matches', async () => {
    const service = createAttachmentService(db, objectStore)
    const input = { id: 'attachment-1', mimeType: 'image/png', sha256: 'a'.repeat(64), size: 4 }

    const created = await service.createUpload('owner-1', input)
    expect(created.upload).toEqual({
      headers: { 'content-type': 'image/png', 'x-amz-meta-sha256': 'a'.repeat(64) },
      url: 'https://objects.test/upload',
    })
    expect(objectStore.createUploadTarget).toHaveBeenCalledWith({
      contentType: 'image/png',
      objectKey: 'attachments/attachment-1/original',
      sha256: 'a'.repeat(64),
    })

    await expect(service.finalizeUpload('owner-1', 'attachment-1')).resolves.toEqual({
      id: 'attachment-1',
      mimeType: 'image/png',
      size: 4,
    })

    const retried = await service.createUpload('owner-1', input)
    expect(retried.upload).toBeNull()
    expect(objectStore.createUploadTarget).toHaveBeenCalledTimes(1)
  })

  it('rejects finalization when the uploaded object does not match', async () => {
    objectStore.inspectObject = vi.fn(async () => ({ contentType: 'image/png', sha256: 'a'.repeat(64), size: 3 }))
    const service = createAttachmentService(db, objectStore)
    await service.createUpload('owner-1', {
      id: 'attachment-1',
      mimeType: 'image/png',
      sha256: 'a'.repeat(64),
      size: 4,
    })

    await expect(service.finalizeUpload('owner-1', 'attachment-1')).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'CONFLICT',
    })
  })

  it('authorizes downloads for an owner and a member of the linked chat', async () => {
    await db.insert(schema.attachments).values({
      id: 'attachment-1',
      ownerId: 'owner-1',
      objectKey: 'attachments/attachment-1/original',
      mimeType: 'image/png',
      size: 4,
      sha256: 'a'.repeat(64),
      state: 'ready',
    })
    await db.insert(schema.chats).values({ id: 'chat-1', type: 'group' })
    await db.insert(schema.chatMembers).values([
      { chatId: 'chat-1', memberType: 'user', userId: 'owner-1' },
      { chatId: 'chat-1', memberType: 'user', userId: 'member-1' },
    ])
    await db.insert(schema.messages).values({
      id: 'message-1',
      chatId: 'chat-1',
      senderId: 'owner-1',
      role: 'user',
      seq: 1,
      content: 'image',
      mediaIds: ['attachment-1'],
      stickerIds: [],
    })
    const service = createAttachmentService(db, objectStore)

    await expect(service.createDownload('owner-1', 'attachment-1')).resolves.toMatchObject({
      url: 'https://objects.test/attachments/attachment-1/original',
    })
    await expect(service.createDownload('member-1', 'attachment-1')).resolves.toMatchObject({
      attachment: { id: 'attachment-1' },
    })
    await expect(service.createDownload('stranger', 'attachment-1')).rejects.toMatchObject({ statusCode: 404 })
  })
})

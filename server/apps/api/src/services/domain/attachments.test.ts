import type { Database } from '../../libs/db'

import { Buffer } from 'node:buffer'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { attachments } from '../../schemas/attachments'
import { createAttachmentService } from './attachments'
import { createChatService } from './chats'

import * as schema from '../../schemas/chats'

const checksum = Buffer.from('a'.repeat(64), 'hex').toString('base64')

function createObjectStore() {
  return {
    createDownloadUrl: vi.fn(async (objectKey: string) => `https://objects.test/${objectKey}`),
    createUploadTarget: vi.fn(async () => ({
      headers: { 'content-type': 'image/png', 'x-amz-checksum-sha256': checksum },
      url: 'https://objects.test/upload',
    })),
    deleteObject: vi.fn(async () => undefined),
    inspectObject: vi.fn(async () => ({
      ContentType: 'image/png',
      ChecksumSHA256: checksum,
      ContentLength: 4,
      $metadata: {},
    })),
  }
}

describe('attachment service', () => {
  let db: Database
  let objectStore: ReturnType<typeof createObjectStore>

  beforeEach(async () => {
    db = await mockDB({ ...schema, attachments })
    objectStore = createObjectStore()
  })

  it('creates a private upload and marks it ready after object metadata matches', async () => {
    const service = createAttachmentService(db, objectStore)
    const thumbnail = { hash: 'HikOLYh4eXepiHecd/d3eoaAdwh4', width: 640, height: 480 }
    const input = { id: 'attachment-1', mimeType: 'image/png', sha256: 'a'.repeat(64), size: 4, thumbnail } as const

    const created = await service.createUpload('owner-1', input)
    expect(created.upload).toEqual({
      headers: { 'content-type': 'image/png', 'x-amz-checksum-sha256': checksum },
      url: 'https://objects.test/upload',
    })
    expect(objectStore.createUploadTarget).toHaveBeenCalledWith({
      Key: 'attachments/attachment-1/original',
      ContentType: 'image/png',
      ChecksumSHA256: checksum,
      IfNoneMatch: '*',
    })

    await expect(service.finalizeUpload('owner-1', 'attachment-1')).resolves.toEqual({
      id: 'attachment-1',
      mimeType: 'image/png',
      size: 4,
      thumbnail,
    })

    const retried = await service.createUpload('owner-1', input)
    expect(retried.upload).toBeNull()
    expect(objectStore.createUploadTarget).toHaveBeenCalledTimes(1)
  })

  it('rejects finalization when the uploaded object does not match', async () => {
    objectStore.inspectObject.mockResolvedValueOnce({ ContentType: 'image/png', ChecksumSHA256: checksum, ContentLength: 3, $metadata: {} })
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

  it('lets only the owner backfill a ready attachment and shares the result with chat members', async () => {
    await db.insert(attachments).values({
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
      sha256: 'a'.repeat(64),
      canBackfillThumbnail: true,
    })
    const memberDownload = await service.createDownload('member-1', 'attachment-1')
    expect(memberDownload.attachment.id).toBe('attachment-1')
    expect(memberDownload.canBackfillThumbnail).toBeUndefined()
    await expect(service.createDownload('stranger', 'attachment-1')).rejects.toMatchObject({ statusCode: 404 })

    const thumbnail = { hash: 'HikOLYh4eXepiHecd/d3eoaAdwh4', width: 640, height: 480 }
    await expect(service.backfillThumbnail('member-1', 'attachment-1', thumbnail)).rejects.toMatchObject({ statusCode: 404 })
    await service.backfillThumbnail('owner-1', 'attachment-1', thumbnail)
    await service.backfillThumbnail('owner-1', 'attachment-1', { ...thumbnail, width: 800 })

    const ownerDownload = await service.createDownload('owner-1', 'attachment-1')
    expect(ownerDownload.attachment.thumbnail).toEqual(thumbnail)
    expect(ownerDownload.canBackfillThumbnail).toBeUndefined()

    const history = await createChatService(db).pullMessages('member-1', 'chat-1', 0)
    expect(history.messages[0]?.attachments?.[0]?.thumbnail).toEqual(thumbnail)
  })
})

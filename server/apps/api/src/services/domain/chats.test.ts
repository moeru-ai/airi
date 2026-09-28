import type { Database } from '../../libs/db'

import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { clampLimit, createChatService, resolveSenderId } from './chats'

import * as schema from '../../schemas'

describe('resolveSenderId', () => {
  it('returns userId for user role', () => {
    expect(resolveSenderId('user', 'user-123')).toBe('user-123')
  })
  it('returns userId for assistant role', () => {
    expect(resolveSenderId('assistant', 'user-123')).toBe('user-123')
    expect(resolveSenderId('system', 'user-123')).toBeNull()
  })
})

describe('clampLimit', () => {
  it('returns default 100 when no limit', () => {
    expect(clampLimit()).toBe(100)
    expect(clampLimit(undefined)).toBe(100)
  })
  it('returns default 100 for zero or negative', () => {
    expect(clampLimit(0)).toBe(100)
    expect(clampLimit(-5)).toBe(100)
  })
  it('returns limit when within range', () => {
    expect(clampLimit(50)).toBe(50)
    expect(clampLimit(500)).toBe(500)
  })
  it('clamps to max 500', () => {
    expect(clampLimit(501)).toBe(500)
    expect(clampLimit(1000)).toBe(500)
  })
})

describe('pushMessages', () => {
  let db: Database

  beforeEach(async () => {
    db = await mockDB(schema)
  })

  it('persists and returns a native reply relation', async () => {
    await db.insert(schema.chats).values({ id: 'group', type: 'group' })
    await db.insert(schema.chatMembers).values({ chatId: 'group', memberType: 'user', userId: 'member' })
    await db.insert(schema.messages).values({
      id: 'assistant-1',
      chatId: 'group',
      senderId: 'member',
      role: 'assistant',
      seq: 1,
      content: 'Earlier answer',
      mediaIds: [],
      stickerIds: [],
    })
    const service = createChatService(db)

    await service.pushMessages('member', 'group', [{
      id: 'user-reply',
      role: 'user',
      content: 'My follow-up',
      replyToMessageId: 'assistant-1',
    }])
    const result = await service.pullMessages('member', 'group', 1)

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0]).toMatchObject({
      id: 'user-reply',
      content: 'My follow-up',
      replyToMessageId: 'assistant-1',
    })
  })

  it('rejects a member attempt to update another member’s message', async () => {
    await db.insert(schema.chats).values({ id: 'group', type: 'group' })
    await db.insert(schema.chatMembers).values([
      { chatId: 'group', memberType: 'user', userId: 'author' },
      { chatId: 'group', memberType: 'user', userId: 'member' },
    ])
    await db.insert(schema.messages).values({
      id: 'message',
      chatId: 'group',
      senderId: 'author',
      role: 'user',
      seq: 1,
      content: 'original',
      mediaIds: [],
      stickerIds: [],
    })

    const service = createChatService(db)

    await expect(service.pushMessages('member', 'group', [{ id: 'message', role: 'user', content: 'forged' }]))
      .rejects
      .toMatchObject({ statusCode: 403, errorCode: 'FORBIDDEN', message: 'Forbidden' })

    const message = await db.query.messages.findFirst({ where: eq(schema.messages.id, 'message') })
    expect(message?.content).toBe('original')
    expect(message?.senderId).toBe('author')
    expect(message?.seq).toBe(1)
  })

  it('rejects an existing message ID from another chat', async () => {
    await db.insert(schema.chats).values([
      { id: 'source', type: 'group' },
      { id: 'target', type: 'group' },
    ])
    await db.insert(schema.chatMembers).values([
      { chatId: 'source', memberType: 'user', userId: 'member' },
      { chatId: 'target', memberType: 'user', userId: 'member' },
    ])
    await db.insert(schema.messages).values({
      id: 'message',
      chatId: 'source',
      senderId: 'member',
      role: 'user',
      seq: 1,
      content: 'source message',
      mediaIds: [],
      stickerIds: [],
    })

    const service = createChatService(db)

    await expect(service.pushMessages('member', 'target', [{ id: 'message', role: 'user', content: 'target message' }]))
      .rejects
      .toMatchObject({ statusCode: 409, errorCode: 'CONFLICT', message: 'Message already belongs to another chat' })

    const sourceMessage = await db.query.messages.findFirst({ where: eq(schema.messages.id, 'message') })
    const targetMessages = await db.query.messages.findMany({ where: eq(schema.messages.chatId, 'target') })
    expect(sourceMessage?.content).toBe('source message')
    expect(targetMessages).toHaveLength(0)
  })

  it('allows an author to update their own message', async () => {
    await db.insert(schema.chats).values({ id: 'group', type: 'group' })
    await db.insert(schema.chatMembers).values({ chatId: 'group', memberType: 'user', userId: 'author' })
    await db.insert(schema.messages).values({
      id: 'message',
      chatId: 'group',
      senderId: 'author',
      role: 'user',
      seq: 1,
      content: 'original',
      mediaIds: [],
      stickerIds: [],
    })

    const service = createChatService(db)

    await expect(service.pushMessages('author', 'group', [{ id: 'message', role: 'user', content: 'updated' }]))
      .resolves
      .toMatchObject({ seq: 2, fromSeq: 2, toSeq: 2 })

    const message = await db.query.messages.findFirst({ where: eq(schema.messages.id, 'message') })
    expect(message?.content).toBe('updated')
    expect(message?.senderId).toBe('author')
    expect(message?.role).toBe('user')
    expect(message?.chatId).toBe('group')
    expect(message?.seq).toBe(2)
  })

  it('acknowledges an unchanged legacy assistant retry without mutating it', async () => {
    await db.insert(schema.chats).values({ id: 'group', type: 'group' })
    await db.insert(schema.chatMembers).values({ chatId: 'group', memberType: 'user', userId: 'member' })
    await db.insert(schema.messages).values({
      id: 'message',
      chatId: 'group',
      senderId: null,
      role: 'assistant',
      seq: 1,
      content: 'original response',
      mediaIds: [],
      stickerIds: [],
    })

    const service = createChatService(db)

    await expect(service.pushMessages('member', 'group', [{ id: 'message', role: 'assistant', content: 'original response' }]))
      .resolves
      .toMatchObject({ seq: 1, fromSeq: 2, toSeq: 1 })

    const message = await db.query.messages.findFirst({ where: eq(schema.messages.id, 'message') })
    expect(message?.content).toBe('original response')
    expect(message?.senderId).toBeNull()
    expect(message?.role).toBe('assistant')
    expect(message?.seq).toBe(1)
  })

  it('persists later messages batched with an unchanged legacy assistant retry', async () => {
    await db.insert(schema.chats).values({ id: 'group', type: 'group' })
    await db.insert(schema.chatMembers).values({ chatId: 'group', memberType: 'user', userId: 'member' })
    await db.insert(schema.messages).values({
      id: 'legacy-assistant',
      chatId: 'group',
      senderId: null,
      role: 'assistant',
      seq: 1,
      content: 'original response',
      mediaIds: [],
      stickerIds: [],
    })

    const service = createChatService(db)

    await expect(service.pushMessages('member', 'group', [
      { id: 'legacy-assistant', role: 'assistant', content: 'original response' },
      { id: 'new-user-message', role: 'user', content: 'next turn' },
    ]))
      .resolves
      .toMatchObject({ seq: 2, fromSeq: 2, toSeq: 2 })

    const messages = await db.query.messages.findMany({
      where: eq(schema.messages.chatId, 'group'),
      orderBy: schema.messages.seq,
    })
    expect(messages).toHaveLength(2)
    expect(messages[0]?.id).toBe('legacy-assistant')
    expect(messages[0]?.seq).toBe(1)
    expect(messages[1]?.id).toBe('new-user-message')
    expect(messages[1]?.senderId).toBe('member')
    expect(messages[1]?.seq).toBe(2)
  })

  it('accepts an assistant message from local-first sync', async () => {
    await db.insert(schema.chats).values({ id: 'group', type: 'group' })
    await db.insert(schema.chatMembers).values({ chatId: 'group', memberType: 'user', userId: 'member' })

    const service = createChatService(db)

    await expect(service.pushMessages('member', 'group', [{ id: 'message', role: 'assistant', content: 'response' }]))
      .resolves
      .toMatchObject({ seq: 1, fromSeq: 1, toSeq: 1 })

    const message = await db.query.messages.findFirst({ where: eq(schema.messages.id, 'message') })
    expect(message?.role).toBe('assistant')
    expect(message?.content).toBe('response')
    expect(message?.senderId).toBe('member')
  })

  it('rejects updates to unowned assistant messages', async () => {
    await db.insert(schema.chats).values({ id: 'group', type: 'group' })
    await db.insert(schema.chatMembers).values([
      { chatId: 'group', memberType: 'user', userId: 'author' },
      { chatId: 'group', memberType: 'user', userId: 'member' },
    ])
    await db.insert(schema.messages).values({
      id: 'message',
      chatId: 'group',
      senderId: null,
      role: 'assistant',
      seq: 1,
      content: 'original response',
      mediaIds: [],
      stickerIds: [],
    })

    const service = createChatService(db)

    await expect(service.pushMessages('member', 'group', [{ id: 'message', role: 'assistant', content: 'forged response' }]))
      .rejects
      .toMatchObject({ statusCode: 403, errorCode: 'FORBIDDEN', message: 'Forbidden' })

    const message = await db.query.messages.findFirst({ where: eq(schema.messages.id, 'message') })
    expect(message?.content).toBe('original response')
    expect(message?.seq).toBe(1)
  })

  it('rejects roles that are not part of cloud chat sync', async () => {
    await db.insert(schema.chats).values({ id: 'group', type: 'group' })
    await db.insert(schema.chatMembers).values({ chatId: 'group', memberType: 'user', userId: 'member' })

    const service = createChatService(db)

    await expect(service.pushMessages('member', 'group', [{ id: 'message', role: 'system', content: 'local prompt' }]))
      .rejects
      .toMatchObject({ statusCode: 400, errorCode: 'BAD_REQUEST', message: 'Only user and assistant messages can be synchronized' })

    const messages = await db.query.messages.findMany({ where: eq(schema.messages.chatId, 'group') })
    expect(messages).toHaveLength(0)
  })
})

describe('deleteMessages', () => {
  let db: Database

  beforeEach(async () => {
    db = await mockDB(schema)
  })

  async function seedChat(
    rows: Array<{ id: string, senderId: string | null, seq: number }>,
    options: { type?: 'bot' | 'group', users?: string[] } = {},
  ) {
    await db.insert(schema.chats).values({ id: 'chat', type: options.type ?? 'group' })
    await db.insert(schema.chatMembers).values((options.users ?? ['author', 'member']).map(userId => ({
      chatId: 'chat',
      memberType: 'user' as const,
      userId,
    })))
    if (rows.length === 0)
      return
    await db.insert(schema.messages).values(rows.map(row => ({
      ...row,
      chatId: 'chat',
      role: 'user',
      content: `content of ${row.id}`,
      mediaIds: [],
      stickerIds: [],
    })))
  }

  // https://github.com/moeru-ai/airi/issues/2671
  it('returns a deletion as a tombstone to a pull from an older cursor for Issue #2671', async () => {
    // ROOT CAUSE:
    //
    // A client deleted a message only in local state. The server kept the row,
    // so a pull from an older cursor returned the message again and the client
    // appended it to the history.
    await seedChat([
      { id: 'u1', senderId: 'author', seq: 1 },
      { id: 'u2', senderId: 'author', seq: 2 },
    ])
    const service = createChatService(db)

    await expect(service.deleteMessages('author', 'chat', ['u1']))
      .resolves
      .toEqual({ seq: 3, fromSeq: 3, toSeq: 3 })

    const pulled = await service.pullMessages('author', 'chat', 0)
    expect(pulled.seq).toBe(3)
    expect(pulled.messages.map(message => [message.id, message.seq])).toEqual([['u2', 2], ['u1', 3]])
    expect(pulled.messages[1]).toMatchObject({ id: 'u1', content: '', deletedAt: expect.any(Number) })
    expect(pulled.messages[0]).toMatchObject({ id: 'u2', content: 'content of u2', deletedAt: null })
  })

  it('changes nothing for a message that is already deleted', async () => {
    await seedChat([{ id: 'u1', senderId: 'author', seq: 1 }])
    const service = createChatService(db)
    await service.deleteMessages('author', 'chat', ['u1'])

    await expect(service.deleteMessages('author', 'chat', ['u1']))
      .resolves
      .toEqual({ seq: 2, fromSeq: 3, toSeq: 2 })

    const message = await db.query.messages.findFirst({ where: eq(schema.messages.id, 'u1') })
    expect(message?.seq).toBe(2)
  })

  it('does not restore a deleted message when a queued send arrives later', async () => {
    await seedChat([{ id: 'u1', senderId: 'author', seq: 1 }])
    const service = createChatService(db)
    await service.deleteMessages('author', 'chat', ['u1'])

    await expect(service.pushMessages('author', 'chat', [{ id: 'u1', role: 'user', content: 'resent' }]))
      .resolves
      .toEqual({ seq: 2, fromSeq: 3, toSeq: 2 })

    const message = await db.query.messages.findFirst({ where: eq(schema.messages.id, 'u1') })
    expect(message?.deletedAt).not.toBeNull()
    expect(message?.content).toBe('content of u1')
    expect(message?.seq).toBe(2)
  })

  it('keeps a deletion that arrives before the send of the same message', async () => {
    await seedChat([])
    const service = createChatService(db)

    await expect(service.deleteMessages('author', 'chat', ['in-flight']))
      .resolves
      .toEqual({ seq: 1, fromSeq: 1, toSeq: 1 })
    await service.pushMessages('author', 'chat', [{ id: 'in-flight', role: 'assistant', content: 'late send' }])

    const pulled = await service.pullMessages('author', 'chat', 0)
    expect(pulled.messages).toEqual([expect.objectContaining({ id: 'in-flight', content: '', deletedAt: expect.any(Number) })])
  })

  it('ignores an id that belongs to another chat', async () => {
    await seedChat([])
    await db.insert(schema.chats).values({ id: 'other', type: 'group' })
    await db.insert(schema.chatMembers).values({ chatId: 'other', memberType: 'user', userId: 'author' })
    await db.insert(schema.messages).values({ id: 'elsewhere', chatId: 'other', senderId: 'author', role: 'user', seq: 1, content: 'kept', mediaIds: [], stickerIds: [] })

    await expect(createChatService(db).deleteMessages('author', 'chat', ['elsewhere']))
      .resolves
      .toEqual({ seq: 0, fromSeq: 1, toSeq: 0 })

    const message = await db.query.messages.findFirst({ where: eq(schema.messages.id, 'elsewhere') })
    expect(message).toMatchObject({ chatId: 'other', content: 'kept', deletedAt: null })
  })

  it('rejects a deletion of another member’s message without changing any row', async () => {
    await seedChat([
      { id: 'own', senderId: 'member', seq: 1 },
      { id: 'other', senderId: 'author', seq: 2 },
    ])
    const service = createChatService(db)

    await expect(service.deleteMessages('member', 'chat', ['own', 'other', 'unknown']))
      .rejects
      .toMatchObject({ statusCode: 403, errorCode: 'FORBIDDEN' })

    const messages = await db.query.messages.findMany({ where: eq(schema.messages.chatId, 'chat') })
    expect(messages.map(message => [message.id, message.deletedAt])).toEqual([['own', null], ['other', null]])
  })

  it('deletes a message without a sender while the caller is the only user member', async () => {
    await seedChat([{ id: 'legacy', senderId: null, seq: 1 }], { type: 'bot', users: ['author'] })

    await expect(createChatService(db).deleteMessages('author', 'chat', ['legacy']))
      .resolves
      .toEqual({ seq: 2, fromSeq: 2, toSeq: 2 })
  })

  it('rejects a deletion of a message without a sender in a bot chat with another user member', async () => {
    await seedChat([{ id: 'legacy', senderId: null, seq: 1 }], { type: 'bot', users: ['author', 'member'] })

    await expect(createChatService(db).deleteMessages('author', 'chat', ['legacy']))
      .rejects
      .toMatchObject({ statusCode: 403 })
  })
})

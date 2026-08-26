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

  it('rejects a member attempt to update another member’s message', async () => {
    await db.insert(schema.chats).values({ id: 'group', type: 'group' })
    await db.insert(schema.chatMembers).values([
      { chatId: 'group', memberType: 'user', userId: 'author' },
      { chatId: 'group', memberType: 'user', userId: 'member' },
    ])
    await db.insert(schema.messages).values({
      chatId: 'group',
      content: 'original',
      id: 'message',
      mediaIds: [],
      role: 'user',
      senderId: 'author',
      seq: 1,
      stickerIds: [],
    })

    const service = createChatService(db)

    await expect(service.pushMessages('member', 'group', [{ content: 'forged', id: 'message', role: 'user' }]))
      .rejects
      .toMatchObject({ errorCode: 'FORBIDDEN', message: 'Forbidden', statusCode: 403 })

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
      chatId: 'source',
      content: 'source message',
      id: 'message',
      mediaIds: [],
      role: 'user',
      senderId: 'member',
      seq: 1,
      stickerIds: [],
    })

    const service = createChatService(db)

    await expect(service.pushMessages('member', 'target', [{ content: 'target message', id: 'message', role: 'user' }]))
      .rejects
      .toMatchObject({ errorCode: 'CONFLICT', message: 'Message already belongs to another chat', statusCode: 409 })

    const sourceMessage = await db.query.messages.findFirst({ where: eq(schema.messages.id, 'message') })
    const targetMessages = await db.query.messages.findMany({ where: eq(schema.messages.chatId, 'target') })
    expect(sourceMessage?.content).toBe('source message')
    expect(targetMessages).toHaveLength(0)
  })

  it('allows an author to update their own message', async () => {
    await db.insert(schema.chats).values({ id: 'group', type: 'group' })
    await db.insert(schema.chatMembers).values({ chatId: 'group', memberType: 'user', userId: 'author' })
    await db.insert(schema.messages).values({
      chatId: 'group',
      content: 'original',
      id: 'message',
      mediaIds: [],
      role: 'user',
      senderId: 'author',
      seq: 1,
      stickerIds: [],
    })

    const service = createChatService(db)

    await expect(service.pushMessages('author', 'group', [{ content: 'updated', id: 'message', role: 'user' }]))
      .resolves
      .toMatchObject({ fromSeq: 2, seq: 2, toSeq: 2 })

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
      chatId: 'group',
      content: 'original response',
      id: 'message',
      mediaIds: [],
      role: 'assistant',
      senderId: null,
      seq: 1,
      stickerIds: [],
    })

    const service = createChatService(db)

    await expect(service.pushMessages('member', 'group', [{ content: 'original response', id: 'message', role: 'assistant' }]))
      .resolves
      .toMatchObject({ fromSeq: 2, seq: 1, toSeq: 1 })

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
      chatId: 'group',
      content: 'original response',
      id: 'legacy-assistant',
      mediaIds: [],
      role: 'assistant',
      senderId: null,
      seq: 1,
      stickerIds: [],
    })

    const service = createChatService(db)

    await expect(service.pushMessages('member', 'group', [
      { content: 'original response', id: 'legacy-assistant', role: 'assistant' },
      { content: 'next turn', id: 'new-user-message', role: 'user' },
    ]))
      .resolves
      .toMatchObject({ fromSeq: 2, seq: 2, toSeq: 2 })

    const messages = await db.query.messages.findMany({
      orderBy: schema.messages.seq,
      where: eq(schema.messages.chatId, 'group'),
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

    await expect(service.pushMessages('member', 'group', [{ content: 'response', id: 'message', role: 'assistant' }]))
      .resolves
      .toMatchObject({ fromSeq: 1, seq: 1, toSeq: 1 })

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
      chatId: 'group',
      content: 'original response',
      id: 'message',
      mediaIds: [],
      role: 'assistant',
      senderId: null,
      seq: 1,
      stickerIds: [],
    })

    const service = createChatService(db)

    await expect(service.pushMessages('member', 'group', [{ content: 'forged response', id: 'message', role: 'assistant' }]))
      .rejects
      .toMatchObject({ errorCode: 'FORBIDDEN', message: 'Forbidden', statusCode: 403 })

    const message = await db.query.messages.findFirst({ where: eq(schema.messages.id, 'message') })
    expect(message?.content).toBe('original response')
    expect(message?.seq).toBe(1)
  })

  it('rejects roles that are not part of cloud chat sync', async () => {
    await db.insert(schema.chats).values({ id: 'group', type: 'group' })
    await db.insert(schema.chatMembers).values({ chatId: 'group', memberType: 'user', userId: 'member' })

    const service = createChatService(db)

    await expect(service.pushMessages('member', 'group', [{ content: 'local prompt', id: 'message', role: 'system' }]))
      .rejects
      .toMatchObject({ errorCode: 'BAD_REQUEST', message: 'Only user and assistant messages can be synchronized', statusCode: 400 })

    const messages = await db.query.messages.findMany({ where: eq(schema.messages.chatId, 'group') })
    expect(messages).toHaveLength(0)
  })
})

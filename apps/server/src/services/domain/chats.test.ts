import type { Database } from '../../libs/db'

import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { clampLimit, createChatService, resolveSenderId } from './chats'

import * as schema from '../../schemas'

describe('resolveSenderId', () => {
  it('returns userId for user role', () => {
    expect(resolveSenderId('user', 'user-123', 'char-456')).toBe('user-123')
  })
  it('returns characterId for non-user role when available', () => {
    expect(resolveSenderId('assistant', 'user-123', 'char-456')).toBe('char-456')
  })
  it('returns null for non-user role without characterId', () => {
    expect(resolveSenderId('assistant', 'user-123')).toBeNull()
    expect(resolveSenderId('system', 'user-123', null)).toBeNull()
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

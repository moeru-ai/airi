import type { Database } from '../../../../libs/db'

import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../../../libs/mock-db'
import { createTestRedis } from '../../../../libs/tests/redis'
import { createCharacterService } from '../../characters'
import { createChatService } from '../../chats'
import { createFluxService } from '../../flux'
import { createProviderService } from '../../providers'

import * as schema from '../../../../schemas'

function fakeConfigKV() {
  return {
    get: vi.fn(async () => undefined),
    getOrThrow: vi.fn(async () => 0),
    set: vi.fn(async () => {}),
  } as any
}

describe('fluxService.deleteAllForUser', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB(schema)
  })

  it('marks userFlux.deletedAt and invalidates Redis cache', async () => {
    await db.insert(schema.user).values({ email: 'a@example.com', id: 'u-flux-1', name: 'A' })
    await db.insert(schema.userFlux).values({ flux: 100, userId: 'u-flux-1' })

    const redis = createTestRedis()
    const del = vi.spyOn(redis, 'del')
    const service = createFluxService(db, redis, fakeConfigKV())
    await service.deleteAllForUser('u-flux-1')

    const row = await db.query.userFlux.findFirst({ where: eq(schema.userFlux.userId, 'u-flux-1') })
    expect(row?.deletedAt).toBeInstanceOf(Date)
    expect(del).toHaveBeenCalledTimes(1)
    expect(del).toHaveBeenCalledWith(expect.stringContaining('u-flux-1'))
  })

  it('is idempotent on retry — already-soft-deleted rows stay unchanged', async () => {
    await db.insert(schema.user).values({ email: 'b@example.com', id: 'u-flux-2', name: 'B' })
    await db.insert(schema.userFlux).values({ flux: 50, userId: 'u-flux-2' })

    const redis = createTestRedis()
    const service = createFluxService(db, redis, fakeConfigKV())

    await service.deleteAllForUser('u-flux-2')
    const firstStamp = (await db.query.userFlux.findFirst({ where: eq(schema.userFlux.userId, 'u-flux-2') }))?.deletedAt

    // Second invocation: WHERE deletedAt IS NULL filters out the
    // already-stamped row, so deletedAt does not change.
    await service.deleteAllForUser('u-flux-2')
    const secondStamp = (await db.query.userFlux.findFirst({ where: eq(schema.userFlux.userId, 'u-flux-2') }))?.deletedAt

    expect(secondStamp).toEqual(firstStamp)
  })
})

describe('providerService.deleteAllForUser', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB(schema)
  })

  it('marks every userProviderConfigs row owned by the user', async () => {
    await db.insert(schema.user).values({ email: 'p@example.com', id: 'u-prov-1', name: 'P' })
    await db.insert(schema.userProviderConfigs).values([
      { definitionId: 'openai', name: 'a', ownerId: 'u-prov-1' },
      { definitionId: 'anthropic', name: 'b', ownerId: 'u-prov-1' },
    ])

    const service = createProviderService(db)
    await service.deleteAllForUser('u-prov-1')

    const rows = await db.query.userProviderConfigs.findMany({ where: eq(schema.userProviderConfigs.ownerId, 'u-prov-1') })
    expect(rows).toHaveLength(2)
    rows.forEach(r => expect(r.deletedAt).toBeInstanceOf(Date))
  })

  it('does not touch other users rows', async () => {
    await db.insert(schema.user).values({ email: 'o@example.com', id: 'u-prov-other', name: 'O' })
    await db.insert(schema.userProviderConfigs).values({ definitionId: 'openai', name: 'kept', ownerId: 'u-prov-other' })

    const service = createProviderService(db)
    await service.deleteAllForUser('u-prov-1')

    const otherRow = await db.query.userProviderConfigs.findFirst({ where: eq(schema.userProviderConfigs.ownerId, 'u-prov-other') })
    expect(otherRow?.deletedAt).toBeNull()
  })
})

describe('characterService.deleteAllForUser', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB(schema)
  })

  it('soft-deletes characters where the user is owner OR creator', async () => {
    await db.insert(schema.user).values([
      { email: 'c1@example.com', id: 'u-char-1', name: 'C1' },
      { email: 'c2@example.com', id: 'u-char-2', name: 'C2' },
    ])
    await db.insert(schema.character).values([
      { characterId: 'cid-1', coverUrl: '', creatorId: 'u-char-2', id: 'char-owner', ownerId: 'u-char-1', version: '1' },
      { characterId: 'cid-2', coverUrl: '', creatorId: 'u-char-1', id: 'char-creator', ownerId: 'u-char-2', version: '1' },
      { characterId: 'cid-3', coverUrl: '', creatorId: 'u-char-2', id: 'char-other', ownerId: 'u-char-2', version: '1' },
    ])

    const service = createCharacterService(db)
    await service.deleteAllForUser('u-char-1')

    const owner = await db.query.character.findFirst({ where: eq(schema.character.id, 'char-owner') })
    const creator = await db.query.character.findFirst({ where: eq(schema.character.id, 'char-creator') })
    const other = await db.query.character.findFirst({ where: eq(schema.character.id, 'char-other') })

    expect(owner?.deletedAt).toBeInstanceOf(Date)
    expect(creator?.deletedAt).toBeInstanceOf(Date)
    expect(other?.deletedAt).toBeNull()
  })

  it('decrements character engagement counters for soft-deleted likes and bookmarks', async () => {
    await db.insert(schema.user).values([
      { email: 'counts@example.com', id: 'u-char-counts', name: 'Counts' },
      { email: 'owner@example.com', id: 'u-char-owner', name: 'Owner' },
    ])
    await db.insert(schema.character).values({
      bookmarksCount: 1,
      characterId: 'cid-counts',
      coverUrl: '',
      creatorId: 'u-char-owner',
      id: 'char-counts',
      likesCount: 1,
      ownerId: 'u-char-owner',
      version: '1',
    })
    await db.insert(schema.characterLikes).values({ characterId: 'char-counts', userId: 'u-char-counts' })
    await db.insert(schema.characterBookmarks).values({ characterId: 'char-counts', userId: 'u-char-counts' })

    const service = createCharacterService(db)
    await service.deleteAllForUser('u-char-counts')

    const character = await db.query.character.findFirst({ where: eq(schema.character.id, 'char-counts') })
    expect(character?.likesCount).toBe(0)
    expect(character?.bookmarksCount).toBe(0)

    await service.deleteAllForUser('u-char-counts')

    const afterRetry = await db.query.character.findFirst({ where: eq(schema.character.id, 'char-counts') })
    expect(afterRetry?.likesCount).toBe(0)
    expect(afterRetry?.bookmarksCount).toBe(0)
  })

  it('soft-deletes the user likes and bookmarks', async () => {
    await db.insert(schema.user).values({ email: 'c3@example.com', id: 'u-char-3', name: 'C3' })
    await db.insert(schema.character).values({
      characterId: 'cid-z',
      coverUrl: '',
      creatorId: 'u-char-3',
      id: 'char-z',
      ownerId: 'u-char-3',
      version: '1',
    })
    await db.insert(schema.characterLikes).values({ characterId: 'char-z', userId: 'u-char-3' })
    await db.insert(schema.characterBookmarks).values({ characterId: 'char-z', userId: 'u-char-3' })

    const service = createCharacterService(db)
    await service.deleteAllForUser('u-char-3')

    const like = await db.query.characterLikes.findFirst({ where: eq(schema.characterLikes.userId, 'u-char-3') })
    const bookmark = await db.query.characterBookmarks.findFirst({ where: eq(schema.characterBookmarks.userId, 'u-char-3') })

    expect(like?.deletedAt).toBeInstanceOf(Date)
    expect(bookmark?.deletedAt).toBeInstanceOf(Date)
  })
})

describe('chatService.deleteAllForUser', () => {
  let db: Database

  beforeAll(async () => {
    db = await mockDB(schema)
  })

  it('soft-deletes chats the user is a member of', async () => {
    await db.insert(schema.user).values({ email: 'chat@example.com', id: 'u-chat-1', name: 'C' })
    await db.insert(schema.chats).values([
      { id: 'chat-mine', title: 'mine', type: 'private' },
      { id: 'chat-other', title: 'other', type: 'private' },
    ])
    await db.insert(schema.chatMembers).values({ chatId: 'chat-mine', memberType: 'user', userId: 'u-chat-1' })

    const service = createChatService(db)
    await service.deleteAllForUser('u-chat-1')

    const mine = await db.query.chats.findFirst({ where: eq(schema.chats.id, 'chat-mine') })
    const other = await db.query.chats.findFirst({ where: eq(schema.chats.id, 'chat-other') })

    expect(mine?.deletedAt).toBeInstanceOf(Date)
    expect(other?.deletedAt).toBeNull()
  })

  it('drops chat_members for shared (group/channel) chats but keeps the chat alive', async () => {
    // Two users in a shared group chat. When user A is deleted, the chat
    // row must survive for user B; only A's chat_members row goes.
    await db.insert(schema.user).values([
      { email: 'grpa@example.com', id: 'u-grp-a', name: 'A' },
      { email: 'grpb@example.com', id: 'u-grp-b', name: 'B' },
    ])
    await db.insert(schema.chats).values({ id: 'chat-grp', title: 'team', type: 'group' })
    await db.insert(schema.chatMembers).values([
      { chatId: 'chat-grp', memberType: 'user', userId: 'u-grp-a' },
      { chatId: 'chat-grp', memberType: 'user', userId: 'u-grp-b' },
    ])

    const service = createChatService(db)
    await service.deleteAllForUser('u-grp-a')

    const chatRow = await db.query.chats.findFirst({ where: eq(schema.chats.id, 'chat-grp') })
    expect(chatRow?.deletedAt).toBeNull() // chat survives

    const remainingMembers = await db.query.chatMembers.findMany({ where: eq(schema.chatMembers.chatId, 'chat-grp') })
    expect(remainingMembers).toHaveLength(1)
    expect(remainingMembers[0]?.userId).toBe('u-grp-b')
  })

  it('preserves the user messages inside group chats so other members keep conversation context', async () => {
    // Anonymization-by-design: in a group chat, user A's messages must NOT
    // be soft-deleted on account deletion — that would corrupt B's history.
    // The senderId stays as the (now-orphan) user.id string; the UI renders
    // it as "Deleted User" once it cannot resolve the id to a real user.
    await db.insert(schema.user).values([
      { email: 'anona@example.com', id: 'u-anon-a', name: 'A' },
      { email: 'anonb@example.com', id: 'u-anon-b', name: 'B' },
    ])
    await db.insert(schema.chats).values({ id: 'chat-anon-grp', title: 'team', type: 'group' })
    await db.insert(schema.chatMembers).values([
      { chatId: 'chat-anon-grp', memberType: 'user', userId: 'u-anon-a' },
      { chatId: 'chat-anon-grp', memberType: 'user', userId: 'u-anon-b' },
    ])
    await db.insert(schema.messages).values([
      { chatId: 'chat-anon-grp', content: 'hi from A', id: 'm-a-1', mediaIds: [], role: 'user', senderId: 'u-anon-a', stickerIds: [] },
      { chatId: 'chat-anon-grp', content: 'hi from B', id: 'm-b-1', mediaIds: [], role: 'user', senderId: 'u-anon-b', stickerIds: [] },
    ])

    const service = createChatService(db)
    await service.deleteAllForUser('u-anon-a')

    // A's message stays alive; senderId still points at the now-orphan user.id string.
    const aMsg = await db.query.messages.findFirst({ where: eq(schema.messages.id, 'm-a-1') })
    expect(aMsg?.deletedAt).toBeNull()
    expect(aMsg?.senderId).toBe('u-anon-a')
    expect(aMsg?.content).toBe('hi from A')

    // B's message obviously untouched.
    const bMsg = await db.query.messages.findFirst({ where: eq(schema.messages.id, 'm-b-1') })
    expect(bMsg?.deletedAt).toBeNull()
  })

  it('soft-deletes messages the user sent in private/bot chats', async () => {
    await db.insert(schema.user).values({ email: 'msg@example.com', id: 'u-chat-2', name: 'M' })
    await db.insert(schema.chats).values({ id: 'chat-msg', title: 't', type: 'private' })
    await db.insert(schema.chatMembers).values({ chatId: 'chat-msg', memberType: 'user', userId: 'u-chat-2' })
    await db.insert(schema.messages).values([
      {
        chatId: 'chat-msg',
        content: 'hi',
        id: 'msg-mine',
        mediaIds: [],
        role: 'user',
        senderId: 'u-chat-2',
        stickerIds: [],
      },
      {
        chatId: 'chat-msg',
        content: 'hello',
        id: 'msg-other',
        mediaIds: [],
        role: 'assistant',
        senderId: 'someone-else',
        stickerIds: [],
      },
    ])

    const service = createChatService(db)
    await service.deleteAllForUser('u-chat-2')

    const mine = await db.query.messages.findFirst({ where: eq(schema.messages.id, 'msg-mine') })
    const other = await db.query.messages.findFirst({ where: eq(schema.messages.id, 'msg-other') })

    expect(mine?.deletedAt).toBeInstanceOf(Date)
    expect(other?.deletedAt).toBeNull()
  })
})

import type { Database } from '../../libs/db'

import { eq } from 'drizzle-orm'
import { beforeAll, describe, expect, it, vi } from 'vitest'

import { mockDB } from '../../libs/mock-db'
import { createCharacterService } from '../characters'
import { createChatService } from '../chats'
import { createFluxService } from '../flux'
import { createProviderService } from '../providers'

import * as schema from '../../schemas'

function fakeRedis() {
  const map = new Map<string, string>()
  return {
    get: vi.fn(async (k: string) => map.get(k) ?? null),
    set: vi.fn(async (k: string, v: string) => {
      map.set(k, v)
      return 'OK'
    }),
    del: vi.fn(async (k: string) => {
      const had = map.has(k)
      map.delete(k)
      return had ? 1 : 0
    }),
  } as any
}

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
    await db.insert(schema.user).values({ id: 'u-flux-1', name: 'A', email: 'a@example.com' })
    await db.insert(schema.userFlux).values({ userId: 'u-flux-1', flux: 100 })

    const redis = fakeRedis()
    const service = createFluxService(db, redis, fakeConfigKV())
    await service.deleteAllForUser('u-flux-1')

    const row = await db.query.userFlux.findFirst({ where: eq(schema.userFlux.userId, 'u-flux-1') })
    expect(row?.deletedAt).toBeInstanceOf(Date)
    expect(redis.del).toHaveBeenCalledTimes(1)
    expect(redis.del).toHaveBeenCalledWith(expect.stringContaining('u-flux-1'))
  })

  it('is idempotent on retry — already-soft-deleted rows stay unchanged', async () => {
    await db.insert(schema.user).values({ id: 'u-flux-2', name: 'B', email: 'b@example.com' })
    await db.insert(schema.userFlux).values({ userId: 'u-flux-2', flux: 50 })

    const redis = fakeRedis()
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
    await db.insert(schema.user).values({ id: 'u-prov-1', name: 'P', email: 'p@example.com' })
    await db.insert(schema.userProviderConfigs).values([
      { ownerId: 'u-prov-1', definitionId: 'openai', name: 'a' },
      { ownerId: 'u-prov-1', definitionId: 'anthropic', name: 'b' },
    ])

    const service = createProviderService(db)
    await service.deleteAllForUser('u-prov-1')

    const rows = await db.query.userProviderConfigs.findMany({ where: eq(schema.userProviderConfigs.ownerId, 'u-prov-1') })
    expect(rows).toHaveLength(2)
    rows.forEach(r => expect(r.deletedAt).toBeInstanceOf(Date))
  })

  it('does not touch other users rows', async () => {
    await db.insert(schema.user).values({ id: 'u-prov-other', name: 'O', email: 'o@example.com' })
    await db.insert(schema.userProviderConfigs).values({ ownerId: 'u-prov-other', definitionId: 'openai', name: 'kept' })

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
      { id: 'u-char-1', name: 'C1', email: 'c1@example.com' },
      { id: 'u-char-2', name: 'C2', email: 'c2@example.com' },
    ])
    await db.insert(schema.character).values([
      { id: 'char-owner', version: '1', coverUrl: '', creatorId: 'u-char-2', ownerId: 'u-char-1', characterId: 'cid-1' },
      { id: 'char-creator', version: '1', coverUrl: '', creatorId: 'u-char-1', ownerId: 'u-char-2', characterId: 'cid-2' },
      { id: 'char-other', version: '1', coverUrl: '', creatorId: 'u-char-2', ownerId: 'u-char-2', characterId: 'cid-3' },
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

  it('soft-deletes the user likes and bookmarks', async () => {
    await db.insert(schema.user).values({ id: 'u-char-3', name: 'C3', email: 'c3@example.com' })
    await db.insert(schema.character).values({
      id: 'char-z',
      version: '1',
      coverUrl: '',
      creatorId: 'u-char-3',
      ownerId: 'u-char-3',
      characterId: 'cid-z',
    })
    await db.insert(schema.characterLikes).values({ userId: 'u-char-3', characterId: 'char-z' })
    await db.insert(schema.characterBookmarks).values({ userId: 'u-char-3', characterId: 'char-z' })

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
    await db.insert(schema.user).values({ id: 'u-chat-1', name: 'C', email: 'chat@example.com' })
    await db.insert(schema.chats).values([
      { id: 'chat-mine', type: 'private', title: 'mine' },
      { id: 'chat-other', type: 'private', title: 'other' },
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
      { id: 'u-grp-a', name: 'A', email: 'grpa@example.com' },
      { id: 'u-grp-b', name: 'B', email: 'grpb@example.com' },
    ])
    await db.insert(schema.chats).values({ id: 'chat-grp', type: 'group', title: 'team' })
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
      { id: 'u-anon-a', name: 'A', email: 'anona@example.com' },
      { id: 'u-anon-b', name: 'B', email: 'anonb@example.com' },
    ])
    await db.insert(schema.chats).values({ id: 'chat-anon-grp', type: 'group', title: 'team' })
    await db.insert(schema.chatMembers).values([
      { chatId: 'chat-anon-grp', memberType: 'user', userId: 'u-anon-a' },
      { chatId: 'chat-anon-grp', memberType: 'user', userId: 'u-anon-b' },
    ])
    await db.insert(schema.messages).values([
      { id: 'm-a-1', chatId: 'chat-anon-grp', senderId: 'u-anon-a', role: 'user', content: 'hi from A', mediaIds: [], stickerIds: [] },
      { id: 'm-b-1', chatId: 'chat-anon-grp', senderId: 'u-anon-b', role: 'user', content: 'hi from B', mediaIds: [], stickerIds: [] },
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
    await db.insert(schema.user).values({ id: 'u-chat-2', name: 'M', email: 'msg@example.com' })
    await db.insert(schema.chats).values({ id: 'chat-msg', type: 'private', title: 't' })
    await db.insert(schema.chatMembers).values({ chatId: 'chat-msg', memberType: 'user', userId: 'u-chat-2' })
    await db.insert(schema.messages).values([
      {
        id: 'msg-mine',
        chatId: 'chat-msg',
        senderId: 'u-chat-2',
        role: 'user',
        content: 'hi',
        mediaIds: [],
        stickerIds: [],
      },
      {
        id: 'msg-other',
        chatId: 'chat-msg',
        senderId: 'someone-else',
        role: 'assistant',
        content: 'hello',
        mediaIds: [],
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

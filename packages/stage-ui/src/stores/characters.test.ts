import type { Character, CreateCharacterPayload } from '../types/character'

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LOCAL_USER_ID } from '../constants'
import { useCharacterStore } from './characters'

const { model } = vi.hoisted(() => ({
  model: {
    list: vi.fn<() => Promise<Character[]>>(),
    saveAll: vi.fn(async () => {}),
    upsert: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  },
}))

vi.mock('../models/characters', () => ({ charactersModel: model }))

const character = {
  id: 'character-1',
  version: '1',
  coverUrl: 'cover.png',
  avatarUrl: undefined,
  characterAvatarUrl: undefined,
  coverBackgroundUrl: undefined,
  creatorRole: undefined,
  priceCredit: '0',
  likesCount: 0,
  bookmarksCount: 0,
  interactionsCount: 0,
  forksCount: 0,
  creatorId: 'user-1',
  ownerId: 'user-1',
  characterId: 'moeka',
  createdAt: new Date('2026-05-08T00:00:00.000Z'),
  updatedAt: new Date('2026-05-08T00:00:00.000Z'),
  deletedAt: undefined,
  capabilities: [],
  avatarModels: [],
  i18n: [],
  prompts: [],
  likes: [],
  bookmarks: [],
} satisfies Character

const payload = {
  character: { version: '1', coverUrl: 'cover.png', characterId: 'moeka' },
  capabilities: [],
  avatarModels: [],
  i18n: [],
  prompts: [],
} satisfies CreateCharacterPayload

describe('character store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    model.list.mockResolvedValue([])
  })

  it('replaces the in-memory list with the characters stored on the device', async () => {
    model.list.mockResolvedValueOnce([character])
    const store = useCharacterStore()
    store.characters.set('stale-character', { ...character, id: 'stale-character' })

    await expect(store.fetchList()).resolves.toEqual([character])

    expect([...store.characters.keys()]).toEqual([character.id])
    expect(store.getCharacter(character.id)).toEqual(character)
  })

  it('creates a character owned by the local user and persists it', async () => {
    const store = useCharacterStore()

    const created = await store.create(payload)

    expect(created.creatorId).toBe(LOCAL_USER_ID)
    expect(created.ownerId).toBe(LOCAL_USER_ID)
    expect(created.likesCount).toBe(0)
    expect(created.bookmarksCount).toBe(0)
    expect(store.getCharacter(created.id)).toEqual(created)
    expect(model.upsert).toHaveBeenCalledWith(created)
  })

  it('keeps the payload id and stamps relation rows with the new character id', async () => {
    const store = useCharacterStore()

    const created = await store.create({
      character: { id: 'chosen-id', version: '2', coverUrl: 'cover.png', characterId: 'moeka' },
      capabilities: [{ type: 'llm', config: { apiKey: 'key', apiBaseUrl: 'https://example.invalid/v1/' } }],
      prompts: [{ language: 'en', type: 'system', content: 'You are Moeka.' }],
    })

    expect(created.id).toBe('chosen-id')
    expect(created.capabilities?.[0]?.characterId).toBe('chosen-id')
    expect(created.prompts?.[0]?.characterId).toBe('chosen-id')
  })

  it('merges update fields into the stored character and persists it', async () => {
    const store = useCharacterStore()
    store.characters.set(character.id, { ...character })

    const updated = await store.update(character.id, { version: '2', coverUrl: 'next.png' })

    expect(updated).toMatchObject({
      id: character.id,
      version: '2',
      coverUrl: 'next.png',
      characterId: character.characterId,
    })
    expect(model.upsert).toHaveBeenCalledWith(updated)
  })

  it('records a local like once and persists the incremented count', async () => {
    const store = useCharacterStore()
    store.characters.set(character.id, { ...character, likes: [], bookmarks: [] })

    const liked = await store.like(character.id)
    const repeated = await store.like(character.id)

    expect(liked?.likesCount).toBe(character.likesCount + 1)
    expect(liked?.likes).toEqual([{ userId: LOCAL_USER_ID, characterId: character.id }])
    // The second call sees the stored like and keeps the count unchanged.
    expect(repeated).toBeUndefined()
    expect(store.getCharacter(character.id)?.likesCount).toBe(character.likesCount + 1)
    expect(model.upsert).toHaveBeenCalledTimes(1)
  })

  it('records a local bookmark once and persists the incremented count', async () => {
    const store = useCharacterStore()
    store.characters.set(character.id, { ...character, likes: [], bookmarks: [] })

    const bookmarked = await store.bookmark(character.id)
    const repeated = await store.bookmark(character.id)

    expect(bookmarked?.bookmarksCount).toBe(character.bookmarksCount + 1)
    expect(bookmarked?.bookmarks).toEqual([{ userId: LOCAL_USER_ID, characterId: character.id }])
    // The second call sees the stored bookmark and keeps the count unchanged.
    expect(repeated).toBeUndefined()
    expect(store.getCharacter(character.id)?.bookmarksCount).toBe(character.bookmarksCount + 1)
    expect(model.upsert).toHaveBeenCalledTimes(1)
  })

  it('removes the character from memory and from storage', async () => {
    const store = useCharacterStore()
    store.characters.set(character.id, { ...character })

    await store.remove(character.id)

    expect(store.getCharacter(character.id)).toBeUndefined()
    expect(model.remove).toHaveBeenCalledWith(character.id)
  })

  it('ignores edits for an unknown character', async () => {
    const store = useCharacterStore()

    await expect(store.update('missing-character', { version: '2' })).resolves.toBeUndefined()
    await expect(store.like('missing-character')).resolves.toBeUndefined()
    await expect(store.bookmark('missing-character')).resolves.toBeUndefined()

    expect(model.upsert).not.toHaveBeenCalled()
  })
})

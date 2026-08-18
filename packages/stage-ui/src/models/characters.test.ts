import type { Character } from '../types/character'

import memoryDriver from 'unstorage/drivers/memory'

import { createStorage } from 'unstorage'
import { beforeEach, describe, expect, it } from 'vitest'

import { createCharactersModel } from './characters'

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
  characterId: 'airi',
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

/**
 * @example
 * describe('models characters', () => {})
 */
describe('models characters', () => {
  let store: ReturnType<typeof createStorage>
  let characters: ReturnType<typeof createCharactersModel>

  beforeEach(() => {
    store = createStorage({
      driver: memoryDriver(),
    })
    characters = createCharactersModel({ storage: store })
  })

  /**
   * @example
   * expect(await characters.list()).toEqual([])
   */
  it('lists characters from the existing local storage key', async () => {
    await store.setItemRaw('local:characters', [character])

    await expect(characters.list()).resolves.toEqual([character])
  })

  /**
   * @example
   * await characters.saveAll([character])
   */
  it('saves all characters to the existing local storage key', async () => {
    await characters.saveAll([character])

    await expect(store.getItemRaw('local:characters')).resolves.toEqual([character])
  })

  /**
   * @example
   * await characters.upsert(character)
   */
  it('upserts a character by id', async () => {
    await store.setItemRaw('local:characters', [{ ...character, characterId: 'old' }])

    await characters.upsert(character)

    await expect(store.getItemRaw('local:characters')).resolves.toEqual([character])
  })

  /**
   * @example
   * await characters.remove('character-1')
   */
  it('removes a character by id', async () => {
    await store.setItemRaw('local:characters', [character])

    await characters.remove('character-1')

    await expect(store.getItemRaw('local:characters')).resolves.toEqual([])
  })

  /**
   * @example
   * await expect(characters.list({ abortSignal: signal })).rejects.toThrow()
   */
  it('throws before local IO when aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(characters.list({ abortSignal: controller.signal })).rejects.toThrow()
  })

  /**
   * @example
   * await expect(characters.upsert(character, { abortSignal })).rejects.toThrow()
   */
  it('throws after local read before follow-up writes when aborted', async () => {
    await store.setItemRaw('local:characters', [])
    const controller = new AbortController()
    const originalGetItemRaw = store.getItemRaw.bind(store)
    store.getItemRaw = async (...args) => {
      const value = await originalGetItemRaw(...args)
      controller.abort()
      return value
    }

    await expect(characters.upsert(character, { abortSignal: controller.signal })).rejects.toThrow()
    await expect(store.getItemRaw('local:characters')).resolves.toEqual([])
  })
})

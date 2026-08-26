import type { Character } from '../types/character'

import memoryDriver from 'unstorage/drivers/memory'

import { createStorage } from 'unstorage'
import { beforeEach, describe, expect, it } from 'vitest'

import { createCharactersModel } from './characters'

const character = {
  avatarModels: [],
  avatarUrl: undefined,
  bookmarks: [],
  bookmarksCount: 0,
  capabilities: [],
  characterAvatarUrl: undefined,
  characterId: 'airi',
  coverBackgroundUrl: undefined,
  coverUrl: 'cover.png',
  createdAt: new Date('2026-05-08T00:00:00.000Z'),
  creatorId: 'user-1',
  creatorRole: undefined,
  deletedAt: undefined,
  forksCount: 0,
  i18n: [],
  id: 'character-1',
  interactionsCount: 0,
  likes: [],
  likesCount: 0,
  ownerId: 'user-1',
  priceCredit: '0',
  prompts: [],
  updatedAt: new Date('2026-05-08T00:00:00.000Z'),
  version: '1',
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

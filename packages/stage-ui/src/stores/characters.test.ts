import type { CharactersModel } from '../models/characters'
import type { CharactersRemoteClient, CharactersService } from '../services/characters'
import type { Character, CreateCharacterPayload, UpdateCharacterPayload } from '../types/character'

import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { createCharactersListQueryOptions, createCharacterStoreController } from './characters'

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

const payload = {
  character: { version: '1', coverUrl: 'cover.png', characterId: 'airi' },
  capabilities: [],
  avatarModels: [],
  i18n: [],
  prompts: [],
} satisfies CreateCharacterPayload

function createMutation<TVars, TData>(mutation: (vars: TVars) => Promise<TData>) {
  return {
    error: ref<Error | null>(null),
    async mutateAsync(vars: TVars) {
      try {
        return await mutation(vars)
      }
      catch (error) {
        this.error.value = error as Error
        throw error
      }
    },
  }
}

function setupController() {
  const model: CharactersModel = {
    list: vi.fn(async () => []),
    saveAll: vi.fn(async () => {}),
    upsert: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  }
  const service: CharactersService = {
    buildLocal: vi.fn(() => ({ ...character, id: 'local-character' })),
    fetchRemote: vi.fn(async () => []),
    fetchRemoteById: vi.fn(async () => character),
    createRemote: vi.fn(async () => character),
    updateRemote: vi.fn(async () => character),
    removeRemote: vi.fn(async () => {}),
    likeRemote: vi.fn(async () => ({ ...character, likesCount: 1 })),
    bookmarkRemote: vi.fn(async () => ({ ...character, bookmarksCount: 1 })),
  }
  const listQuery = {
    error: ref<Error | null>(null),
    isLoading: ref(false),
    refetch: vi.fn(async () => ({ data: [{ ...character, id: 'remote-character' }] })),
  }
  const controller = createCharacterStoreController({
    auth: { userId: 'user-1' },
    bookmarkMutation: createMutation<string, Character>(id => service.bookmarkRemote({} as CharactersRemoteClient, id)),
    characters: ref<Map<string, Character>>(new Map()),
    createMutation: createMutation<CreateCharacterPayload, Character>(nextPayload => service.createRemote({} as CharactersRemoteClient, nextPayload)),
    likeMutation: createMutation<string, Character>(id => service.likeRemote({} as CharactersRemoteClient, id)),
    listAll: ref(false),
    listQuery,
    model,
    removeMutation: createMutation<string, void>(id => service.removeRemote({} as CharactersRemoteClient, id)),
    service,
    updateMutation: createMutation<{ id: string, data: UpdateCharacterPayload }, Character>(vars => service.updateRemote({} as CharactersRemoteClient, vars.id, vars.data)),
  })

  return { controller, listQuery, model, service }
}

/**
 * @example
 * describe('store characters controller', () => {})
 */
describe('store characters controller', () => {
  /**
   * @example
   * await controller.fetchList()
   */
  it('fetchList reads local characters first and then applies remote characters', async () => {
    const { controller, model } = setupController()
    vi.mocked(model.list).mockResolvedValueOnce([character])

    await controller.fetchList()

    expect(controller.characters.value.get('remote-character')).toBeDefined()
    expect(controller.characters.value.get('character-1')).toBeUndefined()
    expect(model.saveAll).toHaveBeenCalledWith([expect.objectContaining({ id: 'remote-character' })])
  })

  /**
   * @example
   * await controller.create(payload)
   */
  it('keeps local create state and exposes mutation errors when remote create fails', async () => {
    const { controller, service } = setupController()
    const error = new Error('remote create failed')
    vi.mocked(service.createRemote).mockRejectedValueOnce(error)

    await expect(controller.create(payload)).resolves.toEqual(expect.objectContaining({ id: 'local-character' }))

    expect(controller.characters.value.get('local-character')).toBeDefined()
    expect(controller.mutationError.value).toBe(error)
  })

  /**
   * @example
   * await controller.update('character-1', { version: '2' })
   */
  it('supports update remove like and bookmark through mutation controllers', async () => {
    const { controller, model, service } = setupController()
    controller.characters.value.set(character.id, character)

    await controller.update(character.id, { version: '2' })
    await controller.like(character.id)
    await controller.bookmark(character.id)
    await controller.remove(character.id)

    expect(service.updateRemote).toHaveBeenCalled()
    expect(service.likeRemote).toHaveBeenCalled()
    expect(service.bookmarkRemote).toHaveBeenCalled()
    expect(service.removeRemote).toHaveBeenCalled()
    expect(model.remove).toHaveBeenCalledWith(character.id)
  })

  /**
   * @example
   * await options.query({ signal })
   */
  it('passes Pinia Colada query abort signal to the character service', async () => {
    const service = {
      fetchRemote: vi.fn(async () => [] as Character[]),
    }
    const listAll = ref(true)
    const controller = new AbortController()
    const options = createCharactersListQueryOptions({
      client: {} as CharactersRemoteClient,
      listAll,
      service: service as Pick<CharactersService, 'fetchRemote'>,
    })

    await options.query({ signal: controller.signal })

    expect(service.fetchRemote).toHaveBeenCalledWith({}, { all: true }, { abortSignal: controller.signal })
  })
})

import type { Character, CreateCharacterPayload, UpdateCharacterPayload } from '../types/character'

import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { parse } from 'valibot'
import { ref } from 'vue'

import { client } from '../composables/api'
import { useLocalFirstRequest } from '../composables/use-local-first'
import { registerOutboxHandler, useOutboxQueue } from '../composables/use-outbox-queue'
import { charactersRepo } from '../database/repos/characters.repo'
import { CharacterWithRelationsSchema } from '../types/character'
import { useAuthStore } from './auth'

function buildLocalCharacter(userId: string, payload: CreateCharacterPayload) {
  const id = payload.character.id ?? nanoid()
  const now = new Date()

  return parse(CharacterWithRelationsSchema, {
    id,
    version: payload.character.version,
    coverUrl: payload.character.coverUrl,
    avatarUrl: undefined,
    characterAvatarUrl: undefined,
    coverBackgroundUrl: undefined,
    creatorRole: undefined,
    priceCredit: '0',
    likesCount: 0,
    bookmarksCount: 0,
    interactionsCount: 0,
    forksCount: 0,
    creatorId: userId,
    ownerId: userId,
    characterId: payload.character.characterId,
    createdAt: now,
    updatedAt: now,
    deletedAt: undefined,
    capabilities: payload.capabilities?.map(capability => ({
      id: nanoid(),
      characterId: id,
      type: capability.type,
      config: capability.config,
    })),
    avatarModels: payload.avatarModels?.map(model => ({
      id: nanoid(),
      characterId: id,
      name: model.name,
      type: model.type,
      description: model.description,
      config: model.config,
      createdAt: now,
      updatedAt: now,
    })),
    i18n: payload.i18n?.map(item => ({
      id: nanoid(),
      characterId: id,
      language: item.language,
      name: item.name,
      description: item.description,
      tags: item.tags,
      createdAt: now,
      updatedAt: now,
    })),
    prompts: payload.prompts?.map(prompt => ({
      id: nanoid(),
      characterId: id,
      language: prompt.language,
      type: prompt.type,
      content: prompt.content,
    })),
    likes: [],
    bookmarks: [],
  })
}

export const useCharacterStore = defineStore('characters', () => {
  const characters = ref<Map<string, Character>>(new Map())
  const auth = useAuthStore()
  useOutboxQueue()

  async function syncCharacterFromServer(data: any) {
    const character = parse(CharacterWithRelationsSchema, data)
    characters.value.set(character.id, character)
    await charactersRepo.upsert(character)
    return character
  }

  async function fetchCharacterRemote(id: string) {
    const res = await client.api.characters[':id'].$get({
      param: { id },
    })
    if (!res.ok) {
      throw new Error('Failed to fetch character')
    }
    const data = await res.json()
    return await syncCharacterFromServer(data)
  }

  async function createCharacterRemote(payload: CreateCharacterPayload) {
    const res = await client.api.characters.$post({
      json: payload,
    })
    if (!res.ok) {
      throw new Error('Failed to create character')
    }
    const data = await res.json()
    return await syncCharacterFromServer(data)
  }

  async function updateCharacterRemote(id: string, payload: UpdateCharacterPayload) {
    const res = await (client.api.characters[':id'].$patch)({
      param: { id },
      // @ts-expect-error FIXME: hono client typing misses json option for this route
      json: payload,
    })
    if (!res.ok) {
      throw new Error('Failed to update character')
    }
    const data = await res.json()
    return await syncCharacterFromServer(data)
  }

  async function removeCharacterRemote(id: string) {
    const res = await client.api.characters[':id'].$delete({
      param: { id },
    })
    if (!res.ok) {
      throw new Error('Failed to remove character')
    }
  }

  async function likeCharacterRemote(id: string) {
    const res = await client.api.characters[':id'].like.$post({
      param: { id },
    })
    if (!res.ok) {
      throw new Error('Failed to like character')
    }
    await fetchCharacterRemote(id)
  }

  async function bookmarkCharacterRemote(id: string) {
    const res = await client.api.characters[':id'].bookmark.$post({
      param: { id },
    })
    if (!res.ok) {
      throw new Error('Failed to bookmark character')
    }
    await fetchCharacterRemote(id)
  }

  registerOutboxHandler<CreateCharacterPayload>('characters.create', async (payload) => {
    await createCharacterRemote(payload)
  })
  registerOutboxHandler<{ id: string, payload: UpdateCharacterPayload }>('characters.update', async (payload) => {
    await updateCharacterRemote(payload.id, payload.payload)
  })
  registerOutboxHandler<{ id: string }>('characters.remove', async (payload) => {
    await removeCharacterRemote(payload.id)
  })
  registerOutboxHandler<{ id: string }>('characters.like', async (payload) => {
    await likeCharacterRemote(payload.id)
  })
  registerOutboxHandler<{ id: string }>('characters.bookmark', async (payload) => {
    await bookmarkCharacterRemote(payload.id)
  })

  async function fetchList(all: boolean = false) {
    // Load from storage immediately
    const cached = await charactersRepo.getAll()
    if (cached.length > 0) {
      characters.value.clear()
      for (const char of cached) {
        characters.value.set(char.id, char)
      }
    }

    return useLocalFirstRequest({
      local: async () => undefined,
      remote: async () => {
        const res = await client.api.characters.$get({
          query: { all: String(all) },
        })
        if (!res.ok) {
          throw new Error('Failed to fetch characters')
        }
        const data = await res.json()

        characters.value.clear()
        const parsedData: Character[] = []
        for (const char of data) {
          const parsed = parse(CharacterWithRelationsSchema, char)
          characters.value.set(char.id, parsed)
          parsedData.push(parsed)
        }
        await charactersRepo.saveAll(parsedData)
      },
    })
  }

  async function fetchById(id: string) {
    return useLocalFirstRequest({
      local: async () => {
        const cached = characters.value.get(id) ?? (await charactersRepo.getAll()).find(char => char.id === id)
        if (cached) {
          characters.value.set(cached.id, cached)
        }
        return cached
      },
      remote: async () => await fetchCharacterRemote(id),
    })
  }

  async function create(payload: CreateCharacterPayload) {
    const localCharacter = buildLocalCharacter(auth.userId, payload)
    const remotePayload: CreateCharacterPayload = {
      ...payload,
      character: {
        ...payload.character,
        id: localCharacter.id,
      },
    }

    return useLocalFirstRequest({
      local: async () => {
        characters.value.set(localCharacter.id, localCharacter)
        await charactersRepo.upsert(localCharacter)
        return localCharacter
      },
      remote: async () => await createCharacterRemote(remotePayload),
      outbox: {
        type: 'characters.create',
        payload: remotePayload,
      },
    })
  }

  async function update(id: string, payload: UpdateCharacterPayload) {
    return useLocalFirstRequest({
      local: async () => {
        const character = characters.value.get(id)
        if (!character) {
          return
        }
        if (payload.version !== undefined)
          character.version = payload.version
        if (payload.coverUrl !== undefined)
          character.coverUrl = payload.coverUrl
        if (payload.characterId !== undefined)
          character.characterId = payload.characterId
        character.updatedAt = new Date()
        characters.value.set(character.id, character)
        await charactersRepo.upsert(character)
        return character
      },
      remote: async () => await updateCharacterRemote(id, payload),
      outbox: {
        type: 'characters.update',
        payload: {
          id,
          payload: { ...payload },
        },
      },
    })
  }

  async function remove(id: string) {
    return useLocalFirstRequest({
      local: async () => {
        characters.value.delete(id)
        await charactersRepo.remove(id)
      },
      remote: async () => {
        await removeCharacterRemote(id)
        characters.value.delete(id)
        await charactersRepo.remove(id)
      },
      outbox: {
        type: 'characters.remove',
        payload: { id },
      },
    })
  }

  async function like(id: string) {
    return useLocalFirstRequest({
      local: async () => {
        const character = characters.value.get(id)
        if (!character) {
          return
        }
        const likes = character.likes ?? []
        if (!likes.some(item => item.userId === auth.userId)) {
          likes.push({ userId: auth.userId, characterId: id })
          character.likes = likes
          character.likesCount += 1
          character.updatedAt = new Date()
          characters.value.set(character.id, character)
          await charactersRepo.upsert(character)
        }
      },
      remote: async () => await likeCharacterRemote(id),
      outbox: {
        type: 'characters.like',
        payload: { id },
      },
    })
  }

  async function bookmark(id: string) {
    return useLocalFirstRequest({
      local: async () => {
        const character = characters.value.get(id)
        if (!character) {
          return
        }
        const bookmarks = character.bookmarks ?? []
        if (!bookmarks.some(item => item.userId === auth.userId)) {
          bookmarks.push({ userId: auth.userId, characterId: id })
          character.bookmarks = bookmarks
          character.bookmarksCount += 1
          character.updatedAt = new Date()
          characters.value.set(character.id, character)
          await charactersRepo.upsert(character)
        }
      },
      remote: async () => await bookmarkCharacterRemote(id),
      outbox: {
        type: 'characters.bookmark',
        payload: { id },
      },
    })
  }

  function getCharacter(id: string) {
    return characters.value.get(id)
  }

  return {
    characters,

    fetchList,
    fetchById,
    create,
    update,
    remove,
    like,
    bookmark,
    getCharacter,
  }
})

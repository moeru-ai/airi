import type { Character, CreateCharacterPayload, UpdateCharacterPayload } from '../types/character'

import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { parse } from 'valibot'
import { ref } from 'vue'

import { client } from '../composables/api'
import { useLocalFirstRequest } from '../composables/use-local-first'
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

  async function fetchList(all: boolean = false) {
    return useLocalFirstRequest({
      local: async () => {
        const cached = await charactersRepo.getAll()
        if (cached.length > 0) {
          characters.value.clear()
          for (const char of cached) {
            characters.value.set(char.id, char)
          }
        }
      },
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
      remote: async () => {
        const res = await client.api.characters[':id'].$get({
          param: { id },
        })
        if (!res.ok) {
          throw new Error('Failed to fetch character')
        }
        const data = await res.json()
        const character = parse(CharacterWithRelationsSchema, data)

        characters.value.set(character.id, character)
        await charactersRepo.upsert(character)
        return character
      },
    })
  }

  async function create(payload: CreateCharacterPayload) {
    let localCharacter: Character
    return useLocalFirstRequest({
      local: async () => {
        localCharacter = buildLocalCharacter(auth.userId, payload)
        characters.value.set(localCharacter.id, localCharacter)
        await charactersRepo.upsert(localCharacter)
        return localCharacter
      },
      remote: async () => {
        const res = await client.api.characters.$post({
          json: payload,
        })
        if (!res.ok) {
          throw new Error('Failed to create character')
        }
        const data = await res.json()
        const character = parse(CharacterWithRelationsSchema, data)

        // Replace local temp character with remote data
        characters.value.delete(localCharacter.id)
        characters.value.set(character.id, character)
        await charactersRepo.remove(localCharacter.id)
        await charactersRepo.upsert(character)
        return character
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
      remote: async () => {
        const res = await (client.api.characters[':id'].$patch)({
          param: { id },
          // @ts-expect-error FIXME: hono client typing misses json option for this route
          json: payload,
        })
        if (!res.ok) {
          throw new Error('Failed to update character')
        }
        const data = await res.json()
        const character = parse(CharacterWithRelationsSchema, data)

        characters.value.set(character.id, character)
        await charactersRepo.upsert(character)
        return character
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
        const res = await client.api.characters[':id'].$delete({
          param: { id },
        })
        if (!res.ok) {
          throw new Error('Failed to remove character')
        }
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
      remote: async () => {
        const res = await client.api.characters[':id'].like.$post({
          param: { id },
        })
        if (!res.ok) {
          throw new Error('Failed to like character')
        }

        const data = await res.json()
        const character = parse(CharacterWithRelationsSchema, data)
        characters.value.set(character.id, character)
        await charactersRepo.upsert(character)
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
      remote: async () => {
        const res = await client.api.characters[':id'].bookmark.$post({
          param: { id },
        })
        if (!res.ok) {
          throw new Error('Failed to bookmark character')
        }

        const data = await res.json()
        const character = parse(CharacterWithRelationsSchema, data)
        characters.value.set(character.id, character)
        await charactersRepo.upsert(character)
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

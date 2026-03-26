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
import { defaultCharacterCardPresets, displayModelPresets } from './display-models'

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

function buildDefaultCharacters(userId: string): Character[] {
  const now = new Date()

  return defaultCharacterCardPresets.map((preset) => {
    const displayModel = displayModelPresets.find(model => model.id === preset.displayModelId && model.type === 'url')
    const avatarModelConfig = preset.avatarModelType === 'live2d'
      ? { live2d: { urls: displayModel ? [displayModel.url] : [] } }
      : { vrm: { urls: displayModel ? [displayModel.url] : [] } }

    return parse(CharacterWithRelationsSchema, {
      id: preset.id,
      version: '1.0.0',
      coverUrl: preset.coverUrl,
      avatarUrl: undefined,
      characterAvatarUrl: preset.characterAvatarUrl,
      coverBackgroundUrl: preset.coverBackgroundUrl,
      creatorRole: 'system',
      priceCredit: '0',
      likesCount: 0,
      bookmarksCount: 0,
      interactionsCount: 0,
      forksCount: 0,
      creatorId: userId,
      ownerId: userId,
      characterId: preset.characterId,
      createdAt: now,
      updatedAt: now,
      deletedAt: undefined,
      capabilities: [],
      avatarModels: [
        {
          id: `avatar-model-${preset.id}`,
          characterId: preset.id,
          name: displayModel?.name || preset.name,
          type: preset.avatarModelType,
          description: `${preset.name} default avatar model`,
          config: avatarModelConfig,
          createdAt: now,
          updatedAt: now,
        },
      ],
      i18n: [
        {
          id: `i18n-${preset.id}`,
          characterId: preset.id,
          language: 'en',
          name: preset.name,
          tagline: preset.tagline,
          description: preset.description,
          tags: ['default', preset.avatarModelType],
          createdAt: now,
          updatedAt: now,
        },
      ],
      prompts: [],
      likes: [],
      bookmarks: [],
    })
  })
}

async function hydrateCharactersWithDefaults(userId: string) {
  const cached = await charactersRepo.getAll()
  const merged = new Map<string, Character>(cached.map(char => [char.id, char]))
  const defaults = buildDefaultCharacters(userId)
  let changed = cached.length === 0

  for (const presetCharacter of defaults) {
    if (!merged.has(presetCharacter.id)) {
      merged.set(presetCharacter.id, presetCharacter)
      changed = true
    }
  }

  const nextCharacters = [...merged.values()]
  if (changed) {
    await charactersRepo.saveAll(nextCharacters)
  }

  return nextCharacters
}

export const useCharacterStore = defineStore('characters', () => {
  const characters = ref<Map<string, Character>>(new Map())
  const auth = useAuthStore()

  async function fetchList(all: boolean = false) {
    return useLocalFirstRequest({
      local: async () => {
        const cached = await hydrateCharactersWithDefaults(auth.userId)

        characters.value.clear()
        for (const char of cached) {
          characters.value.set(char.id, char)
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

        const parsedData: Character[] = []
        for (const char of data) {
          const parsed = parse(CharacterWithRelationsSchema, char)
          parsedData.push(parsed)
        }

        const merged = new Map<string, Character>(parsedData.map(char => [char.id, char]))
        for (const presetCharacter of buildDefaultCharacters(auth.userId)) {
          if (!merged.has(presetCharacter.id)) {
            merged.set(presetCharacter.id, presetCharacter)
          }
        }

        const mergedData = [...merged.values()]
        characters.value.clear()
        for (const char of mergedData) {
          characters.value.set(char.id, char)
        }

        await charactersRepo.saveAll(mergedData)
      },
    })
  }

  async function ensureDefaultCharacters() {
    const cached = await hydrateCharactersWithDefaults(auth.userId)

    characters.value.clear()
    for (const char of cached) {
      characters.value.set(char.id, char)
    }
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

    ensureDefaultCharacters,
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

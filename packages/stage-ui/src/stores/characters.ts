import type { Character, CreateCharacterPayload, UpdateCharacterPayload } from '../types/character'

import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { parse } from 'valibot'
import { ref } from 'vue'

import { client } from '../composables/api'
import { useLocalFirstMutation, useLocalFirstRequest } from '../composables/use-local-first'
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
        return cached
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
      localFirstThenRemote: true,
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
      localFirstThenRemote: true,
    })
  }

  async function create(payload: CreateCharacterPayload) {
    let localCharacter: Character | undefined

    return useLocalFirstMutation<Character, Character>({
      apply: async () => {
        localCharacter = buildLocalCharacter(auth.userId, payload)
        characters.value.set(localCharacter.id, localCharacter)
        await charactersRepo.upsert(localCharacter)
        return async () => {
          if (!localCharacter) {
            return
          }
          characters.value.delete(localCharacter.id)
          await charactersRepo.remove(localCharacter.id)
        }
      },
      action: async () => {
        const res = await client.api.characters.$post({
          json: payload,
        })
        if (!res.ok) {
          throw new Error('Failed to create character')
        }
        const data = await res.json()
        return parse(CharacterWithRelationsSchema, data)
      },
      onSuccess: async (character) => {
        if (localCharacter && localCharacter.id !== character.id) {
          characters.value.delete(localCharacter.id)
          await charactersRepo.remove(localCharacter.id)
        }
        characters.value.set(character.id, character)
        await charactersRepo.upsert(character)
        return character
      },
      shouldRollback: async () => false,
    })
  }

  async function update(id: string, payload: UpdateCharacterPayload) {
    let original: {
      version: Character['version']
      coverUrl: Character['coverUrl']
      characterId: Character['characterId']
      updatedAt: Character['updatedAt']
    } | undefined

    return useLocalFirstMutation<Character, Character>({
      apply: async () => {
        const character = characters.value.get(id)
        if (!character) {
          return () => {}
        }

        original = {
          version: character.version,
          coverUrl: character.coverUrl,
          characterId: character.characterId,
          updatedAt: character.updatedAt,
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
        return async () => {
          if (!original) {
            return
          }
          character.version = original.version
          character.coverUrl = original.coverUrl
          character.characterId = original.characterId
          character.updatedAt = original.updatedAt
          characters.value.set(character.id, character)
          await charactersRepo.upsert(character)
        }
      },
      action: async () => {
        const res = await (client.api.characters[':id'].$patch)({
          param: { id },
          // @ts-expect-error FIXME: hono client typing misses json option for this route
          json: payload,
        })
        if (!res.ok) {
          throw new Error('Failed to update character')
        }
        const data = await res.json()
        return parse(CharacterWithRelationsSchema, data)
      },
      onSuccess: async (character) => {
        characters.value.set(character.id, character)
        await charactersRepo.upsert(character)
        return character
      },
      shouldRollback: async () => false,
    })
  }

  async function remove(id: string) {
    let original: Character | undefined

    return useLocalFirstMutation<void, void>({
      apply: async () => {
        original = characters.value.get(id) ?? (await charactersRepo.getAll()).find(char => char.id === id)
        if (!original) {
          return () => {}
        }
        characters.value.delete(id)
        await charactersRepo.remove(id)
        return async () => {
          if (!original) {
            return
          }
          characters.value.set(original.id, original)
          await charactersRepo.upsert(original)
        }
      },
      action: async () => {
        const res = await client.api.characters[':id'].$delete({
          param: { id },
        })
        if (!res.ok) {
          throw new Error('Failed to remove character')
        }
      },
      shouldRollback: async () => false,
    })
  }

  async function like(id: string) {
    let originalLikes: Character['likes'] = []
    let originalLikesCount = 0
    let originalUpdatedAt: Character['updatedAt'] | undefined
    let didChange = false

    return useLocalFirstMutation<void, void>({
      apply: async () => {
        const character = characters.value.get(id)
        if (!character) {
          return () => {}
        }

        originalLikes = [...(character.likes ?? [])]
        originalLikesCount = character.likesCount
        originalUpdatedAt = character.updatedAt

        if (!originalLikes.some(item => item.userId === auth.userId)) {
          didChange = true
          character.likes = [...originalLikes, { userId: auth.userId, characterId: id }]
          character.likesCount += 1
          character.updatedAt = new Date()
          characters.value.set(character.id, character)
          await charactersRepo.upsert(character)
        }

        return async () => {
          if (!didChange) {
            return
          }
          character.likes = originalLikes
          character.likesCount = originalLikesCount
          character.updatedAt = originalUpdatedAt
          characters.value.set(character.id, character)
          await charactersRepo.upsert(character)
        }
      },
      action: async () => {
        const res = await client.api.characters[':id'].like.$post({
          param: { id },
        })
        if (!res.ok) {
          throw new Error('Failed to like character')
        }
      },
      onSuccess: async () => {
        await fetchById(id)
      },
      shouldRollback: async () => false,
    })
  }

  async function bookmark(id: string) {
    let originalBookmarks: Character['bookmarks'] = []
    let originalBookmarksCount = 0
    let originalUpdatedAt: Character['updatedAt'] | undefined
    let didChange = false

    return useLocalFirstMutation<void, void>({
      apply: async () => {
        const character = characters.value.get(id)
        if (!character) {
          return () => {}
        }

        originalBookmarks = [...(character.bookmarks ?? [])]
        originalBookmarksCount = character.bookmarksCount
        originalUpdatedAt = character.updatedAt

        if (!originalBookmarks.some(item => item.userId === auth.userId)) {
          didChange = true
          character.bookmarks = [...originalBookmarks, { userId: auth.userId, characterId: id }]
          character.bookmarksCount += 1
          character.updatedAt = new Date()
          characters.value.set(character.id, character)
          await charactersRepo.upsert(character)
        }

        return async () => {
          if (!didChange) {
            return
          }
          character.bookmarks = originalBookmarks
          character.bookmarksCount = originalBookmarksCount
          character.updatedAt = originalUpdatedAt
          characters.value.set(character.id, character)
          await charactersRepo.upsert(character)
        }
      },
      action: async () => {
        const res = await client.api.characters[':id'].bookmark.$post({
          param: { id },
        })
        if (!res.ok) {
          throw new Error('Failed to bookmark character')
        }
      },
      onSuccess: async () => {
        await fetchById(id)
      },
      shouldRollback: async () => false,
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

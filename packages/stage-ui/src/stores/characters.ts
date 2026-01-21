import type { Character, CreateCharacterPayload, UpdateCharacterPayload } from '../types/character'

import { defineStore } from 'pinia'
import { parse } from 'valibot'
import { ref } from 'vue'

import { client } from '../composables/api'
import { useAsyncState } from '../composables/use-async-state'
import { charactersRepo } from '../database/repos/characters.repo'
import { CharacterWithRelationsSchema } from '../types/character'

export const useCharacterStore = defineStore('characters', () => {
  const characters = ref<Map<string, Character>>(new Map())

  async function fetchList(all: boolean = false) {
    // Load from storage immediately
    const cached = await charactersRepo.getAll()
    if (cached.length > 0) {
      characters.value.clear()
      for (const char of cached) {
        characters.value.set(char.id, char)
      }
    }

    return useAsyncState(async () => {
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
    }, { immediate: true })
  }

  async function fetchById(id: string) {
    return useAsyncState(async () => {
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
    }, { immediate: true })
  }

  async function create(payload: CreateCharacterPayload) {
    return useAsyncState(async () => {
      const res = await client.api.characters.$post({
        json: payload,
      })
      if (!res.ok) {
        throw new Error('Failed to create character')
      }
      const data = await res.json()
      const character = parse(CharacterWithRelationsSchema, data)

      characters.value.set(character.id, character)
      await charactersRepo.upsert(character)
      return character
    }, { immediate: true })
  }

  async function update(id: string, payload: UpdateCharacterPayload) {
    return useAsyncState(async () => {
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
    }, { immediate: true })
  }

  async function remove(id: string) {
    return useAsyncState(async () => {
      const res = await client.api.characters[':id'].$delete({
        param: { id },
      })
      if (!res.ok) {
        throw new Error('Failed to remove character')
      }

      characters.value.delete(id)
      await charactersRepo.remove(id)
    }, { immediate: true })
  }

  async function like(id: string) {
    return useAsyncState(async () => {
      const res = await client.api.characters[':id'].like.$post({
        param: { id },
      })
      if (!res.ok) {
        throw new Error('Failed to like character')
      }

      await fetchById(id)
    }, { immediate: true })
  }

  async function bookmark(id: string) {
    return useAsyncState(async () => {
      const res = await client.api.characters[':id'].bookmark.$post({
        param: { id },
      })
      if (!res.ok) {
        throw new Error('Failed to bookmark character')
      }

      await fetchById(id)
    }, { immediate: true })
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

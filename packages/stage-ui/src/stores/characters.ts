import type { Character, CreateCharacterPayload, UpdateCharacterPayload } from '../types/character'

import { defineStore } from 'pinia'
import { ref } from 'vue'

import { client } from '../composables/api'
import { useAsyncState } from '../composables/use-async-state'

export const useCharacterStore = defineStore('characters', () => {
  const characters = ref<Map<string, Character>>(new Map())

  async function fetchList(all: boolean = false) {
    return useAsyncState(async () => {
      const res = await client.api.characters.$get({
        query: { all: String(all) },
      })
      if (!res.ok) {
        throw new Error('Failed to fetch characters')
      }
      const data = await res.json()

      characters.value.clear()
      for (const char of data) {
        characters.value.set(char.id, char)
      }
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
      const character = await res.json()

      characters.value.set(character.id, character)
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
      const character = await res.json()

      characters.value.set(character.id, character)
      return character
    }, { immediate: true })
  }

  async function update(id: string, payload: UpdateCharacterPayload) {
    return useAsyncState(async () => {
      const res = await client.api.characters[':id'].$patch({
        param: { id },
        json: payload,
      })
      if (!res.ok) {
        throw new Error('Failed to update character')
      }
      const character = await res.json()

      characters.value.set(character.id, character)
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
    }, { immediate: true })
  }

  async function like(id: string) {
    return useAsyncState(async () => {
      const res = await client.api.characters[':id'].$patch({
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
      const res = await client.api.characters[':id'].$patch({
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

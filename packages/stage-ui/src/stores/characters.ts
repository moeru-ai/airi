import type { Character, CreateCharacterPayload, UpdateCharacterPayload } from '../types/character'

import { defineStore } from 'pinia'
import { ref } from 'vue'

import { client } from '../composables/api'

export const useCharacterStore = defineStore('characters', () => {
  const characters = ref<Map<string, Character>>(new Map())
  const isLoading = ref(false)
  const error = ref<unknown>(null)

  async function fetchList() {
    isLoading.value = true
    error.value = null
    try {
      const res = await client.api.characters.$get()
      if (!res.ok) {
        throw new Error('Failed to fetch characters')
      }
      const data = await res.json()

      characters.value.clear()
      for (const char of data) {
        characters.value.set(char.id, char as Character)
      }
    }
    catch (err) {
      error.value = err
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  async function fetchById(id: string) {
    isLoading.value = true
    error.value = null
    try {
      const res = await client.api.characters[':id'].$get({
        param: { id },
      })
      if (!res.ok) {
        throw new Error('Failed to fetch character')
      }
      const data = await res.json()

      characters.value.set(data.id, data as Character)
      return data
    }
    catch (err) {
      error.value = err
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  async function create(payload: CreateCharacterPayload) {
    isLoading.value = true
    error.value = null
    try {
      const res = await client.api.characters.$post({
        json: payload,
      })
      if (!res.ok) {
        throw new Error('Failed to create character')
      }
      const data = await res.json()

      characters.value.set(data.id, data as Character)
      return data
    }
    catch (err) {
      error.value = err
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  async function update(id: string, payload: UpdateCharacterPayload) {
    isLoading.value = true
    error.value = null
    try {
      const res = await client.api.characters[':id'].$patch({
        param: { id },
        json: payload,
      })
      if (!res.ok) {
        throw new Error('Failed to update character')
      }
      const data = await res.json()

      characters.value.set(data.id, data as Character)
      return data
    }
    catch (err) {
      error.value = err
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  async function remove(id: string) {
    isLoading.value = true
    error.value = null
    try {
      const res = await client.api.characters[':id'].$delete({
        param: { id },
      })
      if (!res.ok) {
        throw new Error('Failed to delete character')
      }

      characters.value.delete(id)
    }
    catch (err) {
      error.value = err
      throw err
    }
    finally {
      isLoading.value = false
    }
  }

  function getCharacter(id: string) {
    return characters.value.get(id)
  }

  return {
    characters,
    isLoading,
    error,
    fetchList,
    fetchById,
    create,
    update,
    remove,
    getCharacter,
  }
})

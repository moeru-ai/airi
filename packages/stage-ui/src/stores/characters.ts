import type { Ref } from 'vue'

import type { Character, CreateCharacterPayload, UpdateCharacterPayload } from '../types/character'

import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { client } from '../composables/api'
import { useSecureStorage } from '../composables/use-secure-storage'
import { charactersModel as model } from '../models/characters'
import { charactersService as service } from '../services/characters'
import { useAuthStore } from './auth'

interface StoreQuery<TData> {
  error: Ref<Error | null>
  isLoading: Ref<boolean>
  refetch: (force?: boolean) => Promise<{ data?: TData }>
}

interface StoreMutation<TVars, TData> {
  error: Ref<Error | null>
  mutateAsync: (vars: TVars) => Promise<TData>
}

function setCharactersMap(target: Map<string, Character>, characters: Character[]) {
  target.clear()
  for (const character of characters) {
    target.set(character.id, character)
  }
}

export function createCharactersListQueryOptions(params: {
  client: Parameters<typeof service.fetchRemote>[0]
  listAll: Ref<boolean>
  service: Pick<typeof service, 'fetchRemote'>
}) {
  return {
    key: () => ['characters', { all: params.listAll.value }],
    query: async (context: { signal: AbortSignal }) => params.service.fetchRemote(params.client, { all: params.listAll.value }, { abortSignal: context.signal }),
    enabled: false,
  }
}

export function createCharacterStoreController(params: {
  auth: { userId: string }
  bookmarkMutation: StoreMutation<string, Character>
  characters: Ref<Map<string, Character>>
  createMutation: StoreMutation<CreateCharacterPayload, Character>
  likeMutation: StoreMutation<string, Character>
  listAll: Ref<boolean>
  listQuery: StoreQuery<Character[]>
  model: typeof model
  removeMutation: StoreMutation<string, void>
  service: typeof service
  updateMutation: StoreMutation<{ id: string, data: UpdateCharacterPayload }, Character>
  activeCharacterId: Ref<string>
  characterCredentials: Ref<Record<string, string>>
}) {
  const {
    auth,
    bookmarkMutation,
    characters,
    createMutation,
    likeMutation,
    listAll,
    listQuery,
    model,
    removeMutation,
    service,
    updateMutation,
    activeCharacterId,
    characterCredentials,
  } = params
  const mutationError = computed(() =>
    createMutation.error.value
    ?? updateMutation.error.value
    ?? removeMutation.error.value
    ?? likeMutation.error.value
    ?? bookmarkMutation.error.value)

  function restoreCredentials(character: Character): Character {
    if (!character.capabilities)
      return character
    return {
      ...character,
      capabilities: character.capabilities.map((cap) => {
        const credKey = `${character.characterId}:${cap.type}`
        const savedApiKey = characterCredentials.value[credKey]
        if (savedApiKey) {
          return {
            ...cap,
            config: {
              ...cap.config,
              apiKey: savedApiKey,
            },
          }
        }
        return cap
      }),
    }
  }

  async function fetchList(all: boolean = false) {
    listAll.value = all
    const cached = await model.list()
    if (cached.length > 0)
      setCharactersMap(characters.value, cached.map(restoreCredentials))

    try {
      const state = await listQuery.refetch(true)
      if (state.data) {
        const restoredData = state.data.map(restoreCredentials)
        await model.saveAll(restoredData)
        setCharactersMap(characters.value, restoredData)
        return restoredData
      }
      return cached.map(restoreCredentials)
    }
    catch {
      return cached.map(restoreCredentials)
    }
  }

  async function fetchById(id: string) {
    const cached = characters.value.get(id) ?? (await model.list()).find(character => character.id === id)
    const restoredCached = cached ? restoreCredentials(cached) : undefined
    if (restoredCached)
      characters.value.set(restoredCached.id, restoredCached)

    try {
      const remote = await service.fetchRemoteById(client, id)
      const restoredRemote = restoreCredentials(remote)
      characters.value.set(restoredRemote.id, restoredRemote)
      await model.upsert(restoredRemote)
      return restoredRemote
    }
    catch {
      return restoredCached
    }
  }

  async function create(payload: CreateCharacterPayload) {
    if (payload.capabilities) {
      for (const cap of payload.capabilities) {
        if (cap.config.apiKey) {
          const credKey = `${payload.character.characterId}:${cap.type}`
          characterCredentials.value[credKey] = cap.config.apiKey
        }
      }
    }

    const localCharacter = service.buildLocal(auth.userId, payload)
    const restoredLocal = restoreCredentials(localCharacter)
    characters.value.set(restoredLocal.id, restoredLocal)
    await model.upsert(restoredLocal)

    try {
      const remote = await createMutation.mutateAsync(payload)
      const restoredRemote = restoreCredentials(remote)
      characters.value.delete(localCharacter.id)
      await model.remove(localCharacter.id)
      characters.value.set(restoredRemote.id, restoredRemote)
      await model.upsert(restoredRemote)
      return restoredRemote
    }
    catch {
      return restoredLocal
    }
  }

  async function update(id: string, payload: UpdateCharacterPayload) {
    if (payload.capabilities) {
      const character = characters.value.get(id)
      const charId = payload.characterId ?? character?.characterId
      if (charId) {
        for (const cap of payload.capabilities) {
          if (cap.config.apiKey !== undefined) {
            const credKey = `${charId}:${cap.type}`
            if (cap.config.apiKey) {
              characterCredentials.value[credKey] = cap.config.apiKey
            }
            else {
              delete characterCredentials.value[credKey]
            }
          }
        }
      }
    }

    const character = characters.value.get(id)
    if (!character)
      return

    const localCharacter = {
      ...character,
      ...(payload.version !== undefined ? { version: payload.version } : {}),
      ...(payload.coverUrl !== undefined ? { coverUrl: payload.coverUrl } : {}),
      ...(payload.characterId !== undefined ? { characterId: payload.characterId } : {}),
      ...(payload.i18n !== undefined ? { i18n: payload.i18n.map(entry => ({ ...entry, id: '', characterId: id, tagline: undefined, createdAt: new Date(), updatedAt: new Date() })) } : {}),
      ...(payload.capabilities !== undefined ? { capabilities: payload.capabilities.map(cap => ({ ...cap, id: '', characterId: id })) } : {}),
      updatedAt: new Date(),
    }
    const restoredLocal = restoreCredentials(localCharacter)
    characters.value.set(restoredLocal.id, restoredLocal)
    await model.upsert(restoredLocal)

    try {
      const remote = await updateMutation.mutateAsync({ id, data: payload })
      const restoredRemote = restoreCredentials(remote)
      characters.value.set(restoredRemote.id, restoredRemote)
      await model.upsert(restoredRemote)
      return restoredRemote
    }
    catch {
      return restoredLocal
    }
  }

  async function remove(id: string) {
    characters.value.delete(id)
    await model.remove(id)

    try {
      await removeMutation.mutateAsync(id)
    }
    catch {
      // Keep current local-first behavior: local removal is retained on remote failure.
    }
  }

  async function like(id: string) {
    const character = characters.value.get(id)
    if (!character)
      return

    const likes = character.likes ?? []
    if (!likes.some(item => item.userId === auth.userId)) {
      const localCharacter = {
        ...character,
        likes: [...likes, { userId: auth.userId, characterId: id }],
        likesCount: character.likesCount + 1,
        updatedAt: new Date(),
      }
      const restoredLocal = restoreCredentials(localCharacter)
      characters.value.set(restoredLocal.id, restoredLocal)
      await model.upsert(restoredLocal)
    }

    try {
      const remote = await likeMutation.mutateAsync(id)
      const restoredRemote = restoreCredentials(remote)
      characters.value.set(restoredRemote.id, restoredRemote)
      await model.upsert(restoredRemote)
    }
    catch {
      // Keep local-first optimistic state.
    }
  }

  async function bookmark(id: string) {
    const character = characters.value.get(id)
    if (!character)
      return

    const bookmarks = character.bookmarks ?? []
    if (!bookmarks.some(item => item.userId === auth.userId)) {
      const localCharacter = {
        ...character,
        bookmarks: [...bookmarks, { userId: auth.userId, characterId: id }],
        bookmarksCount: character.bookmarksCount + 1,
        updatedAt: new Date(),
      }
      const restoredLocal = restoreCredentials(localCharacter)
      characters.value.set(restoredLocal.id, restoredLocal)
      await model.upsert(restoredLocal)
    }

    try {
      const remote = await bookmarkMutation.mutateAsync(id)
      const restoredRemote = restoreCredentials(remote)
      characters.value.set(restoredRemote.id, restoredRemote)
      await model.upsert(restoredRemote)
    }
    catch {
      // Keep local-first optimistic state.
    }
  }

  function getCharacter(id: string) {
    return characters.value.get(id)
  }

  function setActive(id: string) {
    activeCharacterId.value = id
  }

  return {
    characters,
    activeCharacterId,
    isLoading: computed(() => listQuery.isLoading.value),
    error: computed(() => listQuery.error.value),
    mutationError,

    fetchList,
    fetchById,
    create,
    update,
    remove,
    like,
    bookmark,
    getCharacter,
    setActive,
  }
}

export const useCharacterStore = defineStore('characters', () => {
  const characters = ref<Map<string, Character>>(new Map())
  const listAll = ref(false)
  const activeCharacterId = useLocalStorage<string>('airi:active-character-id', '')
  const characterCredentials = useSecureStorage<Record<string, string>>('settings/credentials/characters', {})
  const auth = useAuthStore()
  const queryCache = useQueryCache()

  const listQuery = useQuery(createCharactersListQueryOptions({ client, listAll, service }))
  const createMutation = useMutation({
    mutation: async (payload: CreateCharacterPayload) => service.createRemote(client, payload),
    async onSettled() {
      await queryCache.invalidateQueries({ key: ['characters'] })
    },
  })

  const updateMutation = useMutation({
    mutation: async (payload: { id: string, data: UpdateCharacterPayload }) => service.updateRemote(client, payload.id, payload.data),
    async onSettled() {
      await queryCache.invalidateQueries({ key: ['characters'] })
    },
  })

  const removeMutation = useMutation({
    mutation: async (id: string) => service.removeRemote(client, id),
    async onSettled() {
      await queryCache.invalidateQueries({ key: ['characters'] })
    },
  })

  const likeMutation = useMutation({
    mutation: async (id: string) => service.likeRemote(client, id),
  })
  const bookmarkMutation = useMutation({
    mutation: async (id: string) => service.bookmarkRemote(client, id),
  })

  return createCharacterStoreController({
    auth,
    bookmarkMutation,
    characters,
    createMutation,
    likeMutation,
    listAll,
    listQuery,
    model,
    removeMutation,
    service,
    updateMutation,
    activeCharacterId,
    characterCredentials,
  })
})

import localforage from 'localforage'

import { useBroadcastChannel } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, onScopeDispose, reactive, ref, watch } from 'vue'

import cozyTeaCornerInPastelHuesUrl from '../assets/backgrounds/cozy-tea-corner-in-pastel-hues.avif'
import cuteStreamingRoomWithPastelDecorUrl from '../assets/backgrounds/cute-streaming-room-with-pastel-decor.avif'

import { useAiriCardStore } from './modules/airi-card'

export interface BackgroundEntry {
  id: string
  type: 'builtin' | 'scene' | 'journal' | 'selfie'
  characterId: string | null // null for shared
  title: string
  blob: Blob
  url?: string
  prompt?: string // only for journal
  remixId?: string // only for ComfyUI journal entries
  createdAt: number
}

const BUILTIN_BACKGROUNDS = [
  {
    id: 'builtin:cozy-tea-corner',
    url: cozyTeaCornerInPastelHuesUrl,
    title: 'Cozy tea corner in pastel hues',
  },
  {
    id: 'builtin:cute-streaming-room',
    url: cuteStreamingRoomWithPastelDecorUrl,
    title: 'Cute streaming room with pastel decor',
  },
]

export const useBackgroundStore = defineStore('background', () => {
  const STORAGE_PREFIX = 'bg-'

  const entries = ref<Map<string, BackgroundEntry>>(new Map())
  const loading = ref(true)

  // Track object URLs to prevent leaks
  const blobRefs = new Map<string, any>()
  const backgroundUrls = reactive<Record<string, string | null>>({})

  function ensureObjectUrl(id: string, blob: Blob) {
    if (backgroundUrls[id])
      return backgroundUrls[id]

    try {
      const url = URL.createObjectURL(blob)
      backgroundUrls[id] = url
      return url
    }
    catch (e) {
      console.error(`[BackgroundStore] Failed to create ObjectURL for ${id}`, e)
      return null
    }
  }

  onScopeDispose(() => {
    Object.values(backgroundUrls).forEach((url) => {
      if (url)
        URL.revokeObjectURL(url)
    })
    for (const key in backgroundUrls) {
      delete backgroundUrls[key]
    }
  })

  // Helper to fetch an asset as a blob
  async function fetchAssetAsBlob(url: string): Promise<Blob> {
    const res = await fetch(url)
    return await res.blob()
  }

  async function initializeStore() {
    if (loading.value && entries.value.size > 0)
      return // Already initializing

    loading.value = true
    try {
      const loadedEntries = new Map<string, BackgroundEntry>()

      // 1. Read existing backgrounds from IndexedDB
      await localforage.iterate<BackgroundEntry, void>((val, key) => {
        if (key.startsWith(STORAGE_PREFIX) || key.startsWith('builtin:')) {
          const entry = { ...val, id: key }
          if (entry.blob instanceof Blob) {
            ensureObjectUrl(key, entry.blob)
          }
          loadedEntries.set(key, entry)
        }
      })

      // 2. Migration: check for legacy image-journal entries
      const legacyPrefix = 'image-journal-'
      const legacyEntriesToMigrate: BackgroundEntry[] = []
      const legacyKeysToDelete: string[] = []

      await localforage.iterate<any, void>((val, key) => {
        if (key.startsWith(legacyPrefix)) {
          legacyKeysToDelete.push(key)
          const newId = key.replace(legacyPrefix, STORAGE_PREFIX)

          if (!loadedEntries.has(newId)) {
            const migrated: BackgroundEntry = {
              id: newId,
              type: 'journal',
              characterId: val.characterId,
              title: val.title || 'Migrated Journal Image',
              blob: val.blob,
              prompt: val.prompt,
              createdAt: val.createdAt || Date.now(),
            }
            if (migrated.blob instanceof Blob) {
              ensureObjectUrl(newId, migrated.blob)
            }
            legacyEntriesToMigrate.push(migrated)
            loadedEntries.set(newId, migrated)
          }
        }
      })

      for (const entry of legacyEntriesToMigrate) {
        await localforage.setItem(entry.id, entry)
      }
      for (const key of legacyKeysToDelete) {
        await localforage.removeItem(key)
      }

      // 3. Seeding logic for defaults
      const hasAnyScenesOrBuiltins = Array.from(loadedEntries.values()).some((e) => {
        return e.type === 'scene' || e.type === 'builtin'
      })
      if (!hasAnyScenesOrBuiltins) {
        for (const builtin of BUILTIN_BACKGROUNDS) {
          try {
            const blob = await fetchAssetAsBlob(builtin.url)
            const entry: BackgroundEntry = {
              id: builtin.id,
              type: 'builtin',
              characterId: null,
              title: builtin.title,
              blob,
              createdAt: Date.now(),
            }
            ensureObjectUrl(entry.id, blob)
            await localforage.setItem(entry.id, entry)
            loadedEntries.set(entry.id, entry)
          }
          catch (e) {
            console.error('[BackgroundStore] Failed to seed builtin:', builtin.id, e)
          }
        }
      }

      entries.value = loadedEntries

      // Reconciliation: Purge stale URLs from the reactive map and revoke them to prevent leaks
      Object.keys(backgroundUrls).forEach((id) => {
        if (!loadedEntries.has(id)) {
          const url = backgroundUrls[id]
          if (url) {
            URL.revokeObjectURL(url)
          }
          delete backgroundUrls[id]
        }
      })
    }
    catch (error) {
      console.error('[BackgroundStore] Initialization failed:', error)
    }
    finally {
      loading.value = false
    }
  }

  // Cross-window synchronization
  const { data: syncSignal, post: broadcastSync } = useBroadcastChannel({ name: 'airi:background-sync' })

  watch(syncSignal, () => {
    initializeStore()
  })

  async function sync() {
    broadcastSync(Date.now())
  }

  // Auto-init once
  initializeStore()

  // Find the active background URL for the current character
  const activeBackgroundUrl = computed(() => {
    const airiCardStore = useAiriCardStore()
    if (!airiCardStore.activeCard)
      return null
    const bgId = airiCardStore.activeCard.extensions?.airi?.modules?.activeBackgroundId
    if (!bgId || bgId === 'none') {
      return null
    }

    // Normalize prefix just in case they stored 'image-journal-xyz'
    let lookupId = bgId
    if (bgId.startsWith('image-journal-')) {
      lookupId = bgId.replace('image-journal-', STORAGE_PREFIX)
    }

    // Return the reactive URL from our map if it exists and the entry is still valid
    const entryExists = entries.value.has(lookupId)
    const url = backgroundUrls[lookupId] ?? null

    // NOTICE: We gate the return on entry existence to ensure deleted backgrounds
    // (removed from other windows) do not keep rendering via a stale cached URL.
    if (url && entryExists) {
      return url
    }

    const entry = entries.value.get(lookupId)
    if (!entry) {
      console.warn(`[BackgroundStore] activeBackgroundUrl: No entry or URL found for ID "${lookupId}"`)
      return null
    }

    return null // Should have been caught by backgroundUrls check above if entry is valid
  })

  const getCharacterBackgrounds = computed(() => (characterId?: string) => {
    const list = Array.from(entries.value.values()).filter((e) => {
      // Shared (builtin/scene) or Journal/Selfie for specific character
      return e.type === 'scene' || e.type === 'builtin' || ((e.type === 'journal' || e.type === 'selfie') && characterId && e.characterId === characterId)
    })
    return list.map(e => ({
      ...e,
      url: backgroundUrls[e.id] ?? null,
    })).sort((a, b) => b.createdAt - a.createdAt)
  })

  // List of available backgrounds for the current character
  const availableBackgrounds = computed(() => {
    const airiCardStore = useAiriCardStore()
    return getCharacterBackgrounds.value(airiCardStore.activeCardId)
  })

  const getCharacterJournalEntries = computed(() => (characterId?: string) => {
    return Array.from(entries.value.values()).filter((e) => {
      return (e.type === 'journal' || e.type === 'selfie') && characterId && e.characterId === characterId
    }).map(e => ({
      ...e,
      url: backgroundUrls[e.id] ?? null,
    })).sort((a, b) => b.createdAt - a.createdAt)
  })

  // The 'journal' store functionality needs to access just the journal entries for the active char
  const journalEntries = computed(() => {
    const airiCardStore = useAiriCardStore()
    return getCharacterJournalEntries.value(airiCardStore.activeCardId)
  })

  async function addBackground(
    type: 'scene' | 'journal' | 'selfie',
    blob: Blob,
    title: string,
    prompt?: string,
    characterId?: string | null,
    remixId?: string,
  ) {
    const airiCardStore = useAiriCardStore()
    const id = `${STORAGE_PREFIX}${nanoid()}`

    // Default to active card if journal and no charId provided
    const resolvedCharacterId = characterId !== undefined
      ? characterId
      : ((type === 'journal' || type === 'selfie') ? airiCardStore.activeCardId : null)

    const entry: BackgroundEntry = {
      id,
      type,
      characterId: resolvedCharacterId,
      title: title.trim() || 'Untitled Background',
      blob,
      prompt,
      remixId,
      createdAt: Date.now(),
    }

    try {
      await localforage.setItem(id, entry)
      ensureObjectUrl(id, blob)

      const nextEntries = new Map(entries.value)
      nextEntries.set(id, entry)
      entries.value = nextEntries

      initializeStore()
      await sync()
      return id
    }
    catch (error) {
      console.error('[BackgroundStore] Failed to save entry:', error)
      throw error
    }
  }

  async function removeBackground(id: string) {
    try {
      await localforage.removeItem(id)

      const nextEntries = new Map(entries.value)
      nextEntries.delete(id)
      entries.value = nextEntries

      const blobRef = blobRefs.get(id)
      if (blobRef)
        blobRef.value = undefined
      blobRefs.delete(id)
      const url = backgroundUrls[id]
      if (url) {
        URL.revokeObjectURL(url)
      }
      delete backgroundUrls[id]
      broadcastSync(Date.now())
    }
    catch (error) {
      console.error('[BackgroundStore] Failed to remove entry:', error)
      throw error
    }
  }

  const journalRecentEntries = computed(() => {
    return journalEntries.value.slice(0, 5)
  })

  return {
    entries,
    loading,
    availableBackgrounds,
    getCharacterBackgrounds,
    journalEntries,
    getCharacterJournalEntries,
    activeBackgroundUrl,
    journalRecentEntries,
    addBackground,
    removeBackground,
    getBackgroundUrl: (id: string) => backgroundUrls[id] ?? null,
    initializeStore,
  }
})

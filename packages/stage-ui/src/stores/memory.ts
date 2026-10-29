import type { MemoryEntry, MemoryWrite } from '../types/memory'

import { errorMessageFrom } from '@moeru/std'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { useBroadcastChannel } from '@vueuse/core'
import { defineStore } from 'pinia'
import { v7 as uuidv7 } from 'uuid'
import { computed, ref, watch } from 'vue'

import { memoryRepo } from '../database/repos/memory.repo'

const LEGACY_ENTRIES_STORAGE_KEY = 'memory/entries'

// NOTICE:
// Up to v0.13.1 the entries were in localStorage under `memory/entries`, keyed by a name that the model chose.
// localStorage holds a few megabytes, and two facts could share a name. IndexedDB keeps the entries now, with store-made ids.
// Move them once. The lock keeps two windows that start together from moving them twice.
// Removal condition: two releases after the release that moves them.
async function moveLegacyEntries() {
  if (!globalThis.localStorage?.getItem(LEGACY_ENTRIES_STORAGE_KEY))
    return
  await navigator.locks.request('airi:memory-move', async () => {
    const stored = localStorage.getItem(LEGACY_ENTRIES_STORAGE_KEY)
    if (!stored)
      return
    const legacy: (Omit<MemoryEntry, 'id'> & { name: string })[] = JSON.parse(stored)
    await memoryRepo.add(legacy.map(({ description, body, persona, updatedAt }) => ({ id: uuidv7(), description, body, persona, updatedAt })))
    localStorage.removeItem(LEGACY_ENTRIES_STORAGE_KEY)
  })
}

/**
 * Long-term memory as a small index and one entry per fact, kept by the character itself.
 * IndexedDB keeps the entries. After each change, the other windows read them again.
 *
 * Use when:
 * - A run reads the index or an entry, writes or forgets a fact, or Settings lists the memories by card.
 *
 * Expects:
 * - Callers pass the character card of the run. It reads its own memories and the general ones.
 * - Only the owner makes a memory general, in Settings. A run writes and forgets only its own card's memories.
 *
 * Returns:
 * - Whether memory is on, entries, `ready` for the first read, the index for a card, and actions that change entries.
 */
export const useMemoryStore = defineStore('memory', () => {
  const enabled = useLocalStorageManualReset<boolean>('memory/enabled', true)
  const entries = ref<MemoryEntry[]>([])
  const { data: changed, post } = useBroadcastChannel<string[], string[]>({ name: 'airi:memory' })
  let pendingLoad = moveLegacyEntries()
    .catch(error => console.warn('[memory] Failed to move the entries from localStorage:', errorMessageFrom(error)))

  /** Reads the entries again, after the reads that started before. */
  function load() {
    pendingLoad = pendingLoad.catch(() => {}).then(async () => {
      entries.value = await memoryRepo.list()
    })
    return pendingLoad
  }

  /**
   * Resolves after every read that started before the call, the first read and the move from localStorage included.
   * Until then, `entries` is empty because nothing is read yet, not because nothing is remembered.
   */
  function ready() {
    return pendingLoad.catch(() => {})
  }

  /** Reads the entries again after a change, and tells the other windows. */
  async function publish(ids: string[]) {
    await load()
    post(ids)
  }

  /**
   * The index for a card: its own memories, then general ones, each as an id and its description.
   * A run reads it when it starts, from the entries that the window read last.
   */
  function indexFor(personaId: string) {
    const line = (entry: MemoryEntry) => `- ${entry.id}: ${entry.description}`
    const own = entries.value.filter(entry => entry.persona === personaId).map(line)
    const general = entries.value.filter(entry => !entry.persona).map(line)
    return [
      ...(own.length ? [`Your own:\n${own.join('\n')}`] : []),
      ...(general.length ? [`General:\n${general.join('\n')}`] : []),
    ].join('\n')
  }

  /** Reads an entry that the persona can see by its id: one of its own, or a general one. */
  function read(id: string, personaId: string) {
    return entries.value.find(entry => entry.id === id && (!entry.persona || entry.persona === personaId))
  }

  /**
   * Saves a fact on the card. An id of the card's own entry replaces that entry. Any other id, for example of a general
   * entry that only the owner changes, adds a new entry. Resolves to the stored entry, or undefined for an empty body.
   */
  async function write(input: MemoryWrite, personaId: string) {
    const body = input.body.trim()
    if (!body)
      return undefined
    const entry = await memoryRepo.write({ id: input.id, description: input.description.trim(), body }, personaId, Date.now())
    await publish([entry.id])
    return entry
  }

  /** Makes a card's memory general, so every card reads it. */
  async function makeGeneral(entry: Pick<MemoryEntry, 'id'>) {
    if (await memoryRepo.makeGeneral(entry.id, Date.now()))
      await publish([entry.id])
  }

  /** Removes one entry from Settings. */
  async function remove(entry: Pick<MemoryEntry, 'id'>) {
    await memoryRepo.remove([entry.id], Date.now())
    await publish([entry.id])
  }

  /** Forgets an entry of the card by its id. General memories belong to the owner, so a run cannot forget them. */
  async function forget(id: string, personaId: string) {
    if (!await memoryRepo.forget(id, personaId, Date.now()))
      return false
    await publish([id])
    return true
  }

  async function resetState() {
    enabled.reset()
    await memoryRepo.clear()
    await publish([])
  }

  function reload() {
    void load().catch(error => console.warn('[memory] Failed to read the entries:', errorMessageFrom(error)))
  }
  watch(changed, reload)
  reload()

  return {
    enabled,
    entries: computed(() => entries.value),
    ready,
    indexFor,
    read,
    write,
    makeGeneral,
    forget,
    remove,
    resetState,
  }
})

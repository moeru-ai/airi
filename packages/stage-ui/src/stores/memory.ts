import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

/**
 * Who can see a memory. `owner` stays in conversations that only the owner reads.
 * `shared` can also reach scenes, for example a Discord channel.
 */
export type MemoryVisibility = 'owner' | 'shared'

/** One remembered fact. Personas share long-term memory. */
export interface MemoryEntry {
  /** Short unique name in kebab case. The index lists it, and tools address the entry by it. */
  name: string
  /** One line that tells when the entry matters. */
  description: string
  body: string
  visibility: MemoryVisibility
  updatedAt: number
}

/** Longest index line of one entry, so a long description cannot grow every prompt. */
const INDEX_DESCRIPTION_LIMIT = 150

/** Turns a free name into the kebab-case key that entries use. */
export function memoryName(name: string) {
  return name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 64)
}

/**
 * Long-term memory as a small index and one entry per fact.
 *
 * Use when:
 * - A run reads the index or an entry, the owner's conversation writes or forgets a fact, or Settings lists the entries.
 *
 * Expects:
 * - Callers pass whether the reader is the owner alone. Owner-only entries never reach any other reader.
 *
 * Returns:
 * - Entries, the index for a reader, and actions that change entries.
 */
export const useMemoryStore = defineStore('memory', () => {
  const entries = useLocalStorageManualReset<MemoryEntry[]>('memory/entries', [])

  const sorted = computed(() => [...entries.value].sort((left, right) => left.name.localeCompare(right.name)))

  /** Entries that a reader can see. A reader that is not the owner alone sees only shared entries. */
  function visibleTo(ownerOnly: boolean) {
    return sorted.value.filter(entry => ownerOnly || entry.visibility === 'shared')
  }

  /** The index lines for a reader: each name and its description. Empty when nothing is visible. */
  function indexFor(ownerOnly: boolean) {
    return visibleTo(ownerOnly).map(entry => `- ${entry.name}: ${entry.description.slice(0, INDEX_DESCRIPTION_LIMIT)}`).join('\n')
  }

  function read(name: string, ownerOnly: boolean) {
    const key = memoryName(name)
    return visibleTo(ownerOnly).find(entry => entry.name === key)
  }

  /** Creates or replaces an entry by name. Returns the stored entry, or undefined for an empty name or body. */
  function write(entry: Omit<MemoryEntry, 'updatedAt' | 'name'> & { name: string }) {
    const name = memoryName(entry.name)
    if (!name || !entry.body.trim())
      return undefined
    const next: MemoryEntry = { name, description: entry.description.trim(), body: entry.body.trim(), visibility: entry.visibility, updatedAt: Date.now() }
    entries.value = [...entries.value.filter(existing => existing.name !== name), next]
    return next
  }

  function forget(name: string) {
    const key = memoryName(name)
    const before = entries.value.length
    entries.value = entries.value.filter(entry => entry.name !== key)
    return entries.value.length < before
  }

  function resetState() {
    entries.reset()
  }

  return {
    entries: sorted,
    visibleTo,
    indexFor,
    read,
    write,
    forget,
    resetState,
  }
})

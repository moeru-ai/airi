import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

/** Where a memory belongs: every persona, or one persona alone. */
export type MemoryScope = 'general' | 'persona'

/** One remembered fact. General memories reach every persona. A persona memory reaches only its persona. */
export interface MemoryEntry {
  /** Short name in kebab case, unique within its scope. The index lists it, and tools address the entry by it. */
  name: string
  /** One line that tells when the entry matters. */
  description: string
  body: string
  /** The persona that owns this memory. Without it, the memory is general. */
  persona?: string
  updatedAt: number
}

/** Longest index line of one entry, so a long description cannot grow every prompt. */
const INDEX_DESCRIPTION_LIMIT = 150

/** Turns a free name into the kebab-case key that entries use. */
export function memoryName(name: string) {
  return name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 64)
}

/**
 * Long-term memory as a small index and one entry per fact, kept by the character itself.
 *
 * Use when:
 * - A run reads the index or an entry, writes or forgets a fact, or Settings lists the memories by persona.
 *
 * Expects:
 * - Callers pass the persona of the run. It reads general memories and its own.
 *
 * Returns:
 * - Entries, the index for a persona, and actions that change entries.
 */
export const useMemoryStore = defineStore('memory', () => {
  const entries = useLocalStorageManualReset<MemoryEntry[]>('memory/entries', [])

  const sorted = computed(() => [...entries.value].sort((left, right) => left.name.localeCompare(right.name)))

  /** General memories and the persona's own. */
  function visibleTo(personaId: string) {
    return sorted.value.filter(entry => !entry.persona || entry.persona === personaId)
  }

  /** The index for a persona: its own memories, then general ones, each as a name and its description. */
  function indexFor(personaId: string) {
    const line = (entry: MemoryEntry) => `- ${entry.name}: ${entry.description.slice(0, INDEX_DESCRIPTION_LIMIT)}`
    const own = sorted.value.filter(entry => entry.persona === personaId).map(line)
    const general = sorted.value.filter(entry => !entry.persona).map(line)
    return [
      ...(own.length ? [`Your own:\n${own.join('\n')}`] : []),
      ...(general.length ? [`General:\n${general.join('\n')}`] : []),
    ].join('\n')
  }

  /** Reads an entry by name. The persona's own entry wins over a general one with the same name. */
  function read(name: string, personaId: string) {
    const key = memoryName(name)
    const matches = visibleTo(personaId).filter(entry => entry.name === key)
    return matches.find(entry => entry.persona === personaId) ?? matches[0]
  }

  /** Creates or replaces an entry by name in its scope. Returns the stored entry, or undefined for an empty name or body. */
  function write(entry: Pick<MemoryEntry, 'name' | 'description' | 'body'> & { scope: MemoryScope }, personaId: string) {
    const name = memoryName(entry.name)
    if (!name || !entry.body.trim())
      return undefined
    const persona = entry.scope === 'persona' ? personaId : undefined
    const next: MemoryEntry = { name, description: entry.description.trim(), body: entry.body.trim(), ...(persona ? { persona } : {}), updatedAt: Date.now() }
    entries.value = [...entries.value.filter(existing => existing.name !== name || existing.persona !== persona), next]
    return next
  }

  /** Removes one entry, from a tool or from Settings. */
  function remove(entry: Pick<MemoryEntry, 'name' | 'persona'>) {
    entries.value = entries.value.filter(existing => existing.name !== entry.name || existing.persona !== entry.persona)
  }

  /** Forgets an entry by name. The persona's own entry goes first. */
  function forget(name: string, personaId: string) {
    const target = read(name, personaId)
    if (!target)
      return false
    remove(target)
    return true
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
    remove,
    resetState,
  }
})

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed } from 'vue'

/** One remembered topic and its facts. A character keeps it on its own card. A general memory reaches every card. */
export interface MemoryEntry {
  /** Made by the store when the entry is added. The index lists it, and tools address the entry by it. */
  id: string
  /** The index line: the fact itself when it fits in one line, or when the entry matters. */
  description: string
  body: string
  /** The character card that owns this memory. Without it, the owner made the memory general. */
  persona?: string
  updatedAt: number
}

/** A fact to save. The id of one of the card's own entries changes that entry. Without it, the write adds an entry. */
export interface MemoryWrite {
  id?: string
  description: string
  body: string
}

/**
 * Long-term memory as a small index and one entry per topic, kept by the character itself.
 *
 * Use when:
 * - A run reads the index or an entry, writes or forgets a fact, or Settings lists the memories by card.
 *
 * Expects:
 * - Callers pass the character card of the run. It reads its own memories and the general ones.
 * - Only the owner makes a memory general, in Settings. A run writes and forgets only its own card's memories.
 *
 * Returns:
 * - Whether memory is on, entries, the index for a card, and actions that change entries.
 */
export const useMemoryStore = defineStore('memory', () => {
  const enabled = useLocalStorageManualReset<boolean>('memory/enabled', true)
  const entries = useLocalStorageManualReset<MemoryEntry[]>('memory/entries', [])

  // NOTICE:
  // Entries saved before this change have the name that the model chose, and no id.
  // The model-chosen name was the key, so two facts could collide and an edit could add a near copy. The store makes the id now.
  // Source: the memory store of moeru-ai/airi#2748.
  // Remove two releases after the release that adds the id.
  if (entries.value.some(entry => !entry.id))
    entries.value = entries.value.map(entry => entry.id ? entry : { ...entry, id: nanoid() })

  /** General memories and the persona's own. */
  function visibleTo(personaId: string) {
    return entries.value.filter(entry => !entry.persona || entry.persona === personaId)
  }

  /** The index for a card: its own memories, then general ones, each as an id and its description. */
  function indexFor(personaId: string) {
    const line = (entry: MemoryEntry) => `- ${entry.id}: ${entry.description}`
    const own = entries.value.filter(entry => entry.persona === personaId).map(line)
    const general = entries.value.filter(entry => !entry.persona).map(line)
    return [
      ...(own.length ? [`Your own:\n${own.join('\n')}`] : []),
      ...(general.length ? [`General:\n${general.join('\n')}`] : []),
    ].join('\n')
  }

  /** Reads an entry that the persona can see by its id. */
  function read(id: string, personaId: string) {
    return visibleTo(personaId).find(entry => entry.id === id)
  }

  /**
   * Saves a fact on the card. An id of the card's own entry replaces that entry. Any other id, for example of a general
   * entry that only the owner changes, adds a new entry. Returns the stored entry, or undefined for an empty body.
   */
  function write(input: MemoryWrite, personaId: string) {
    const body = input.body.trim()
    if (!body)
      return undefined
    const own = entries.value.find(entry => entry.id === input.id && entry.persona === personaId)
    const next: MemoryEntry = { id: own?.id ?? nanoid(), description: input.description.trim(), body, persona: personaId, updatedAt: Date.now() }
    entries.value = [...entries.value.filter(entry => entry !== own), next]
    return next
  }

  /**
   * Replaces the `replaced` entries of the card with the result of a tidy-up. Each result keeps the id of its first old
   * entry. Entries outside `replaced`, for example ones saved during the tidy-up, stay.
   */
  function consolidate(personaId: string, replaced: string[], results: { ids: string[], description: string, body: string }[]) {
    const old = new Set(replaced)
    const updatedAt = Date.now()
    const next = results.map((result): MemoryEntry => {
      const kept = entries.value.find(entry => entry.id === result.ids[0] && entry.persona === personaId)
      if (kept && result.ids.length === 1 && kept.description === result.description && kept.body === result.body)
        return kept
      return { id: result.ids[0], description: result.description.trim(), body: result.body.trim(), persona: personaId, updatedAt }
    })
    entries.value = [...entries.value.filter(entry => entry.persona !== personaId || !old.has(entry.id)), ...next]
  }

  /** Makes a card's memory general, so every card reads it. */
  function makeGeneral(entry: Pick<MemoryEntry, 'id'>) {
    const source = entries.value.find(existing => existing.id === entry.id)
    if (!source?.persona)
      return
    const { persona: _card, ...general } = source
    entries.value = [...entries.value.filter(existing => existing !== source), { ...general, updatedAt: Date.now() }]
  }

  /** Removes one entry, from a tool or from Settings. */
  function remove(entry: Pick<MemoryEntry, 'id'>) {
    entries.value = entries.value.filter(existing => existing.id !== entry.id)
  }

  /** Forgets an entry of the card by its id. General memories belong to the owner, so a run cannot forget them. */
  function forget(id: string, personaId: string) {
    const target = entries.value.find(entry => entry.id === id && entry.persona === personaId)
    if (!target)
      return false
    remove(target)
    return true
  }

  function resetState() {
    enabled.reset()
    entries.reset()
  }

  return {
    enabled,
    entries: computed(() => entries.value),
    visibleTo,
    indexFor,
    read,
    write,
    consolidate,
    makeGeneral,
    forget,
    remove,
    resetState,
  }
})

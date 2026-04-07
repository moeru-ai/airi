import type { ccv3 } from '@proj-airi/ccc'

import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export interface LorebookEntry {
  id: string
  keys: string[]
  secondaryKeys?: string[]
  content: string
  enabled: boolean
  selective?: boolean
  caseSensitive?: boolean
  insertionOrder: number
  priority?: number
  position?: 'after_char' | 'before_char'
  constant?: boolean
  name?: string
  comment?: string
}

export const useLorebookStore = defineStore('character-lorebook', () => {
  const entries = ref<LorebookEntry[]>([])
  const scanDepth = ref(10)
  const tokenBudget = ref(2048)
  const recursiveScanning = ref(false)

  const enabledEntries = computed(() => entries.value.filter(e => e.enabled))
  const constantEntries = computed(() => enabledEntries.value.filter(e => e.constant))

  function addEntry(payload: Omit<LorebookEntry, 'id'>): LorebookEntry {
    const entry: LorebookEntry = { id: nanoid(), ...payload }
    entries.value.push(entry)
    return entry
  }

  function removeEntry(id: string) {
    entries.value = entries.value.filter(e => e.id !== id)
  }

  function updateEntry(id: string, patch: Partial<Omit<LorebookEntry, 'id'>>) {
    const entry = entries.value.find(e => e.id === id)
    if (entry)
      Object.assign(entry, patch)
  }

  function importFromCharacterBook(bookEntries: ccv3.CharacterBookEntry[]) {
    for (const cbe of bookEntries) {
      addEntry({
        keys: cbe.keys,
        secondaryKeys: cbe.secondary_keys,
        content: cbe.content,
        enabled: cbe.enabled,
        selective: cbe.selective,
        caseSensitive: cbe.case_sensitive,
        insertionOrder: cbe.insertion_order,
        priority: cbe.priority,
        position: cbe.position,
        constant: cbe.constant,
        name: cbe.name,
        comment: cbe.comment,
      })
    }
  }

  function scanForMatches(text: string): LorebookEntry[] {
    const matched: LorebookEntry[] = []

    for (const entry of enabledEntries.value) {
      if (entry.constant) {
        matched.push(entry)
        continue
      }

      const flags = entry.caseSensitive ? '' : 'i'
      const primaryMatch = entry.keys.some((key) => {
        try {
          return new RegExp(`\\b${escapeRegex(key)}\\b`, flags).test(text)
        }
        catch {
          return text.includes(key)
        }
      })

      if (!primaryMatch)
        continue

      if (entry.selective && entry.secondaryKeys?.length) {
        const secondaryMatch = entry.secondaryKeys.some((key) => {
          try {
            return new RegExp(`\\b${escapeRegex(key)}\\b`, flags).test(text)
          }
          catch {
            return text.includes(key)
          }
        })
        if (!secondaryMatch)
          continue
      }

      matched.push(entry)
    }

    return matched.sort((a, b) => a.insertionOrder - b.insertionOrder)
  }

  function clear() {
    entries.value = []
  }

  return {
    entries,
    scanDepth,
    tokenBudget,
    recursiveScanning,
    enabledEntries,
    constantEntries,
    addEntry,
    removeEntry,
    updateEntry,
    importFromCharacterBook,
    scanForMatches,
    clear,
  }
})

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

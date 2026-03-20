import type { TextJournalEntry, TextJournalEntrySource } from '../types/text-journal'

import { nanoid } from 'nanoid'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

import { textJournalRepo } from '../database/repos/text-journal.repo'
import { useAuthStore } from './auth'
import { useAiriCardStore } from './modules/airi-card'

function normalizeEntry(entry: TextJournalEntry): TextJournalEntry {
  return {
    id: String(entry.id),
    userId: String(entry.userId),
    characterId: String(entry.characterId),
    characterName: String(entry.characterName),
    title: String(entry.title ?? ''),
    content: String(entry.content ?? ''),
    source: entry.source ?? 'tool',
    createdAt: Number.isFinite(entry.createdAt) ? Number(entry.createdAt) : Date.now(),
    updatedAt: Number.isFinite(entry.updatedAt) ? Number(entry.updatedAt) : Date.now(),
  }
}

function normalizeEntries(entries: TextJournalEntry[]) {
  return entries.map(normalizeEntry)
}

export const useTextJournalStore = defineStore('text-journal', () => {
  const { userId } = storeToRefs(useAuthStore())
  const { activeCard, activeCardId, cards } = storeToRefs(useAiriCardStore())

  const entries = ref<TextJournalEntry[]>([])
  const loading = ref(false)
  const initializedForUserId = ref<string | null>(null)

  function getCurrentUserId() {
    return userId.value || 'local'
  }

  const sortedEntries = computed(() => {
    return [...entries.value].sort((a, b) => b.createdAt - a.createdAt || b.updatedAt - a.updatedAt)
  })

  async function load() {
    const currentUserId = getCurrentUserId()
    if (initializedForUserId.value === currentUserId)
      return

    loading.value = true
    try {
      entries.value = normalizeEntries(await textJournalRepo.getAll(currentUserId) ?? [])
      initializedForUserId.value = currentUserId
    }
    finally {
      loading.value = false
    }
  }

  async function persist(nextEntries: TextJournalEntry[]) {
    const currentUserId = getCurrentUserId()
    const snapshot = normalizeEntries(JSON.parse(JSON.stringify(nextEntries)) as TextJournalEntry[])
    await textJournalRepo.saveAll(currentUserId, snapshot)
    entries.value = snapshot
    initializedForUserId.value = currentUserId
  }

  async function createEntry(input: {
    title?: string
    content: string
    source?: TextJournalEntrySource
    characterId?: string
  }) {
    await load()

    const targetCard = input.characterId
      ? cards.value.get(input.characterId)
      : activeCard.value

    if (!targetCard)
      throw new Error('No active character is available for text_journal.create.')

    const currentUserId = getCurrentUserId()
    const now = Date.now()
    const nextEntry: TextJournalEntry = {
      id: nanoid(),
      userId: currentUserId,
      characterId: input.characterId ?? activeCardId.value ?? '',
      characterName: targetCard.name,
      title: (input.title?.trim() || 'Journal Entry'),
      content: input.content.trim(),
      source: input.source ?? 'tool',
      createdAt: now,
      updatedAt: now,
    }

    if (!nextEntry.characterId)
      throw new Error('Active character could not be resolved for text journal entry creation.')

    const nextEntries = [nextEntry, ...entries.value]
    await persist(nextEntries)
    return nextEntry
  }

  async function seedActiveCharacterEntry() {
    const targetCard = activeCard.value
    if (!targetCard)
      throw new Error('No active character is available to seed the text journal.')

    return await createEntry({
      title: 'Seeded Journal Entry',
      source: 'seed',
      content: [
        `This is a seeded long-term journal entry for ${targetCard.name}.`,
        'It exists to verify that text_journal.create is wired, persisted, and scoped to the active character.',
      ].join('\n\n'),
    })
  }

  async function searchEntries(input: {
    query: string
    limit?: number
    characterId?: string
  }) {
    await load()

    const normalizedQuery = input.query.trim().toLowerCase()
    if (!normalizedQuery)
      return []

    const targetCharacterId = input.characterId ?? activeCardId.value ?? ''
    const scopedEntries = entries.value.filter(entry => !targetCharacterId || entry.characterId === targetCharacterId)

    const ranked = scopedEntries
      .map((entry) => {
        const title = entry.title.toLowerCase()
        const content = entry.content.toLowerCase()
        const characterName = entry.characterName.toLowerCase()

        let score = 0
        if (title.includes(normalizedQuery))
          score += 4
        if (content.includes(normalizedQuery))
          score += 2
        if (characterName.includes(normalizedQuery))
          score += 1

        return {
          entry,
          score,
        }
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || b.entry.createdAt - a.entry.createdAt)

    return ranked
      .slice(0, Math.max(1, Math.min(input.limit ?? 5, 10)))
      .map(item => item.entry)
  }

  return {
    entries: sortedEntries,
    loading,
    load,
    createEntry,
    seedActiveCharacterEntry,
    searchEntries,
  }
})

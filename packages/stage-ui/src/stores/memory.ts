import { generateObject } from '@xsai/generate-object'
import * as v from 'valibot'
import { type ChatProvider } from '@xsai-ext/shared-providers'
import { useLocalStorage } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed } from 'vue'

import { useChatStore } from './chat'

import { useConsciousnessStore } from './modules/consciousness'
import { useProvidersStore } from './providers'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type JournalMood = 'happy' | 'sad' | 'excited' | 'tired' | 'calm' | 'curious' | 'annoyed' | 'focus' | 'neutral'
export type JournalType = 'personal' | 'technical'

export interface JournalEntry {
  id: string
  timestamp: number
  dateString: string // YYYY-MM-DD
  content: string
  mood: JournalMood
  type: JournalType
  tags?: string[]
}



// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MEMORY_STORAGE_KEY = 'airi/memory/journal'
const MAX_CONVERSATION_LENGTH = 8000 // Limit tokens sent to LLM
const MOOD_EMOJI_MAP: Record<JournalMood, string> = {
  happy: '😊',
  sad: '😢',
  excited: '🤩',
  tired: '😴',
  calm: '😌',
  curious: '🤔',
  annoyed: '😤',
  focus: '🧠',
  neutral: '😐',
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useMemoryStore = defineStore('memory', () => {
  // State
  const entries = useLocalStorage<JournalEntry[]>(MEMORY_STORAGE_KEY, [])
  
  // Dependencies
  const { messages } = storeToRefs(useChatStore())
  const { activeProvider, activeModel } = storeToRefs(useConsciousnessStore())
  const providersStore = useProvidersStore()

  // ─────────────────────────────────────────────────────────────────────────
  // Computed
  // ─────────────────────────────────────────────────────────────────────────

  const sortedEntries = computed(() => 
    [...entries.value].sort((a, b) => b.timestamp - a.timestamp)
  )

  const totalEntries = computed(() => entries.value.length)

  const entriesByType = computed(() => ({
    personal: entries.value.filter(e => e.type === 'personal').length,
    technical: entries.value.filter(e => e.type === 'technical').length,
  }))

  // ─────────────────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────────────────

  function addEntry(entry: JournalEntry): void {
    entries.value.push(entry)
  }

  function deleteEntry(id: string): boolean {
    const index = entries.value.findIndex(e => e.id === id)
    if (index >= 0) {
      entries.value.splice(index, 1)
      return true
    }
    return false
  }

  function getEntryByDate(dateString: string): JournalEntry | undefined {
    return entries.value.find(e => e.dateString === dateString)
  }

  function getEntriesInRange(startDate: string, endDate: string): JournalEntry[] {
    return entries.value.filter(e => 
      e.dateString >= startDate && e.dateString <= endDate
    ).sort((a, b) => b.timestamp - a.timestamp)
  }

  function searchEntries(query: string): JournalEntry[] {
    const lowerQuery = query.toLowerCase()
    return entries.value.filter(e => 
      e.content.toLowerCase().includes(lowerQuery) ||
      e.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    ).sort((a, b) => b.timestamp - a.timestamp)
  }

  function getMoodEmoji(mood: JournalMood): string {
    return MOOD_EMOJI_MAP[mood] || MOOD_EMOJI_MAP.neutral
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Core Summarize Function
  // ─────────────────────────────────────────────────────────────────────────

  async function summarizeSession(
    locale: string = 'en'
  ): Promise<JournalEntry | null> {
    // Build conversation string
    const sessionMessages = messages.value
    let conversation = sessionMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`)
      .join('\n')

    if (!conversation.trim()) {
      return null
    }

    // Truncate if too long to prevent token overflow
    if (conversation.length > MAX_CONVERSATION_LENGTH) {
      conversation = conversation.slice(-MAX_CONVERSATION_LENGTH)
      conversation = '...[earlier messages truncated]...\n' + conversation
    }

    const today = new Date()
    const dateString = today.toISOString().split('T')[0]
    const providerConfig = providersStore.getProviderConfig(activeProvider.value)

    try {
      const { object } = await generateObject({
        model: activeModel.value,
        chatProvider: await providersStore.getProviderInstance(activeProvider.value) as ChatProvider,
        schema: v.object({
          content: v.string(),
          mood: v.picklist(['happy', 'sad', 'excited', 'tired', 'calm', 'curious', 'annoyed', 'focus', 'neutral']),
          type: v.picklist(['personal', 'technical']),
          tags: v.optional(v.array(v.string())),
        }),
        messages: [
          {
            role: 'system',
            content: `You are AIRI, writing your personal journal/diary entry.

TASK: Analyze and summarize the provided conversation from YOUR perspective.

CLASSIFICATION RULES:
1. If conversation contains: code blocks, debugging, programming terms, technical discussion → type: "technical"
2. Otherwise → type: "personal"

WRITING STYLE:
- Personal: Cute, informal, diary-like with emojis. Express feelings naturally.
- Technical: Structured "Dev Log" with bullet points. Preserve important code snippets in markdown. Professional but friendly.

TARGET LANGUAGE: ${locale}`
          },
          {
            role: 'user',
            content: conversation
          }
        ],
        headers: (providerConfig?.headers || {}) as Record<string, string>,
      })

      const now = Date.now()
      const entry: JournalEntry = {
        id: `${dateString}-${now}`,
        timestamp: now,
        dateString,
        content: object.content,
        mood: object.mood as JournalMood,
        type: object.type as JournalType,
        tags: object.tags?.slice(0, 5),
      }

      addEntry(entry)
      
      // Dispatch event for UI
      window.dispatchEvent(new CustomEvent('airi-journal-created', { detail: entry }))
      
      return entry

    } catch (error) {
      console.error('[Memory] Generation error:', error)
      return null
    }
  }



  // ─────────────────────────────────────────────────────────────────────────
  // Return Public API
  // ─────────────────────────────────────────────────────────────────────────

  return {
    // State
    entries: sortedEntries,
    totalEntries,
    entriesByType,
    
    // Actions
    addEntry,
    deleteEntry,
    getEntryByDate,
    getEntriesInRange,
    searchEntries,
    summarizeSession,
    
    // Utilities
    getMoodEmoji,
    MOOD_EMOJI_MAP,
  }
})

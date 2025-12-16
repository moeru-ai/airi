import { tool } from '@xsai/tool'
import { z } from 'zod'

import { useMemoryStore } from '../stores/memory'
import type { JournalEntry } from '../stores/memory'

// ─────────────────────────────────────────────────────────────────────────────
// Journal Tools for LLM
// ─────────────────────────────────────────────────────────────────────────────

const tools = [
  // Write a new journal entry
  tool({
    name: 'write_journal',
    description: 'Write a journal/diary entry for the current conversation. Use when the user asks you to write a diary, journal, or summary of the day.',
    execute: async ({ locale }) => {
      const store = useMemoryStore()
      const entry = await store.summarizeSession(locale || 'en')
      
      if (!entry) {
        return JSON.stringify({
          success: false,
          error: 'Failed to create journal entry. No active conversation found.',
        })
      }
      
      return JSON.stringify({
        success: true,
        entry: {
          date: entry.dateString,
          mood: entry.mood,
          type: entry.type,
          preview: entry.content.substring(0, 100) + '...',
          tags: entry.tags,
        },
      })
    },
    parameters: z.object({
      locale: z.string().optional().describe('Language code for the journal entry (e.g., "en", "vi", "ja"). Defaults to "en".'),
    }),
  }),

  // Check if journal exists for a date
  tool({
    name: 'check_journal_status',
    description: 'Check if a journal entry exists for today or a specific date. Use when the user asks "Did you write the diary?" or "Have you journaled today?"',
    execute: async ({ date }) => {
      const store = useMemoryStore()
      const today = new Date()
      const targetDate = date || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const entry = store.getEntryByDate(targetDate)
      
      if (entry) {
        return JSON.stringify({
          exists: true,
          date: targetDate,
          mood: entry.mood,
          moodEmoji: store.getMoodEmoji(entry.mood),
          type: entry.type,
          preview: entry.content.substring(0, 50) + '...',
        })
      }
      
      return JSON.stringify({
        exists: false,
        date: targetDate,
        message: `No journal entry found for ${targetDate}.`,
      })
    },
    parameters: z.object({
      date: z.string().optional().describe('Date in YYYY-MM-DD format. Defaults to today.'),
    }),
  }),

  // Read journal entries
  tool({
    name: 'read_journal',
    description: 'Read past journal entries. Use when the user asks about past memories, what happened on a specific day, or wants to recall conversations.',
    execute: async ({ date, startDate, endDate, limit, query }) => {
      const store = useMemoryStore()
      let results: JournalEntry[] = []

      // Search by query
      if (query) {
        results = store.searchEntries(query).slice(0, limit || 5)
      }
      // Get specific date
      else if (date) {
        const entry = store.getEntryByDate(date)
        if (entry) results = [entry]
      }
      // Get date range
      else if (startDate && endDate) {
        results = store.getEntriesInRange(startDate, endDate).slice(0, limit || 10)
      }
      // Get latest entries
      else {
        results = store.entries.slice(0, limit || 3)
      }

      if (results.length === 0) {
        return JSON.stringify({
          found: false,
          message: 'No journal entries found matching your criteria.',
        })
      }

      return JSON.stringify({
        found: true,
        count: results.length,
        entries: results.map(e => ({
          id: e.id,
          date: e.dateString,
          mood: e.mood,
          moodEmoji: store.getMoodEmoji(e.mood),
          type: e.type,
          content: e.content,
          tags: e.tags,
        })),
      })
    },
    parameters: z.object({
      date: z.string().optional().describe('Specific date to read (YYYY-MM-DD).'),
      startDate: z.string().optional().describe('Start date for range query (YYYY-MM-DD).'),
      endDate: z.string().optional().describe('End date for range query (YYYY-MM-DD).'),
      limit: z.number().optional().describe('Max number of entries to return. Default 3.'),
      query: z.string().optional().describe('Search query to find entries by content or tags.'),
    }),
  }),

  // Delete a journal entry
  tool({
    name: 'delete_journal',
    description: 'Delete a journal entry by its ID. Use when the user wants to remove a specific memory.',
    execute: async ({ id }) => {
      const store = useMemoryStore()
      const success = store.deleteEntry(id)
      
      return JSON.stringify({
        success,
        message: success 
          ? `Journal entry ${id} deleted successfully.`
          : `Could not find journal entry with ID: ${id}`,
      })
    },
    parameters: z.object({
      id: z.string().describe('The ID of the journal entry to delete.'),
    }),
  }),

  // Get journal statistics
  tool({
    name: 'journal_stats',
    description: 'Get statistics about journal entries. Use when the user asks how many diaries/memories exist.',
    execute: async () => {
      const store = useMemoryStore()
      const stats = store.entriesByType
      
      return JSON.stringify({
        total: store.totalEntries,
        personal: stats.personal,
        technical: stats.technical,
      })
    },
    parameters: z.object({}),
  }),
]

export const journal = async () => Promise.all(tools)

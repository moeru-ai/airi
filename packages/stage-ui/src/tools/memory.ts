import { tool } from '@xsai/tool'
import { z } from 'zod'

import { useCharacterNotebookStore } from '../stores/character/notebook'

const tools = [
  tool({
    name: 'memory_save',
    description: 'Save a memory note about the user or conversation for future reference. Use this to remember important facts, preferences, or events that the user shares.',
    execute: async (params: { text: string, kind: string, tags: string }) => {
      const notebook = useCharacterNotebookStore()
      const kind = params.kind
      const tags = params.tags ? params.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined
      const opts = { tags }
      const entry = kind === 'diary'
        ? notebook.addDiaryEntry(params.text, opts)
        : kind === 'focus'
          ? notebook.addFocusEntry(params.text, opts)
          : notebook.addNote(params.text, opts)
      return `Memory saved (id: ${entry.id}, kind: ${kind}).`
    },
    parameters: z.object({
      text: z.string().describe('The memory content to save'),
      kind: z.string().describe('Memory type: "note" (general fact), "diary" (timestamped event), or "focus" (important attention item)'),
      tags: z.string().describe('Comma-separated tags for categorization, e.g. "preference,food" or "event,birthday"'),
    }),
  }),
  tool({
    name: 'memory_recall',
    description: 'Search saved memories by keywords or tags. Returns matching memory entries.',
    execute: async (params: { query: string }) => {
      const notebook = useCharacterNotebookStore()
      const query = params.query.toLowerCase()
      const matches = notebook.entries.filter((entry) => {
        if (entry.text.toLowerCase().includes(query))
          return true
        if (entry.tags?.some(tag => tag.toLowerCase().includes(query)))
          return true
        return false
      })

      if (!matches.length)
        return 'No memories found matching the query.'

      return matches
        .slice(0, 10)
        .map(m => `[${m.kind}] ${m.text} (tags: ${m.tags?.join(', ') || 'none'}, saved: ${new Date(m.createdAt).toLocaleDateString()})`)
        .join('\n')
    },
    parameters: z.object({
      query: z.string().describe('Search query to find memories by content or tags'),
    }),
  }),
  tool({
    name: 'memory_list',
    description: 'List recent memories. Use to review what has been remembered.',
    execute: async (params: { kind: string, limit: number }) => {
      const notebook = useCharacterNotebookStore()
      let filtered = notebook.entries
      if (params.kind && params.kind !== 'all')
        filtered = filtered.filter(e => e.kind === params.kind)

      const recent = filtered.slice(-params.limit).reverse()
      if (!recent.length)
        return 'No memories stored yet.'

      return recent
        .map(m => `[${m.kind}] ${m.text} (tags: ${m.tags?.join(', ') || 'none'})`)
        .join('\n')
    },
    parameters: z.object({
      kind: z.string().describe('Filter by kind: "all", "note", "diary", or "focus"'),
      limit: z.number().int().min(1).max(20).describe('Max number of entries to return'),
    }),
  }),
]

export const memory = async () => Promise.all(tools)

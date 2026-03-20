import type { Tool } from '@xsai/shared-chat'

import { useShortTermMemoryStore, useTextJournalStore } from '@proj-airi/stage-ui/stores'
import { tool } from '@xsai/tool'
import { z } from 'zod'

const textJournalParams = z.object({
  action: z.enum(['create', 'search']).describe('Choose one: create or search.'),
  title: z.string().optional().describe('Short human-readable label for the journal entry when creating.'),
  content: z.string().optional().describe('The journal entry text to append for the active character when creating.'),
  query: z.string().optional().describe('Keyword query to search within the active character journal entries.'),
  limit: z.number().int().min(1).max(10).optional().describe('Maximum number of search results to return.'),
}).strict()

async function executeCreateTextJournalEntry(params: { title?: string, content?: string }) {
  if (!params.content?.trim())
    throw new Error('content is required for text_journal.create')

  const store = useTextJournalStore()
  const entry = await store.createEntry({
    title: params.title,
    content: params.content,
    source: 'tool',
  })

  return `Saved text journal entry "${entry.title}" for ${entry.characterName}.`
}

async function executeSearchTextJournalEntries(params: { query?: string, limit?: number }) {
  if (!params.query?.trim())
    throw new Error('query is required for text_journal.search')

  const longTermStore = useTextJournalStore()
  await longTermStore.load()

  const entries = await longTermStore.searchEntries({
    query: params.query,
    limit: params.limit,
  })

  if (entries.length > 0) {
    return entries.map((entry, index) => [
      `Result ${index + 1}:`,
      'Layer: long-term',
      `Title: ${entry.title}`,
      `Character: ${entry.characterName}`,
      `Created At: ${new Date(entry.createdAt).toISOString()}`,
      `Content: ${entry.content}`,
    ].join('\n')).join('\n\n')
  }

  const shortTermStore = useShortTermMemoryStore()
  await shortTermStore.load()
  const shortTermBlocks = shortTermStore.searchBlocks({
    query: params.query,
    limit: params.limit,
  })

  if (shortTermBlocks.length === 0)
    return `No memory entries found for query "${params.query}" in long-term or short-term memory.`

  return shortTermBlocks.map((block, index) => [
    `Result ${index + 1}:`,
    'Layer: short-term',
    `Date: ${block.date}`,
    `Character: ${block.characterName}`,
    `Created At: ${new Date(block.createdAt).toISOString()}`,
    `Content: ${block.summary}`,
  ].join('\n')).join('\n\n')
}

async function executeTextJournalAction(params: {
  action: 'create' | 'search'
  title?: string
  content?: string
  query?: string
  limit?: number
}) {
  if (params.action === 'create')
    return await executeCreateTextJournalEntry(params)

  if (params.action === 'search')
    return await executeSearchTextJournalEntries(params)

  return 'No text journal action performed.'
}

const tools: Promise<Tool>[] = [
  tool({
    name: 'text_journal',
    description: 'Create or search long-term text journal entries for the currently active character.',
    execute: params => executeTextJournalAction(params as {
      action: 'create' | 'search'
      title?: string
      content?: string
      query?: string
      limit?: number
    }),
    parameters: textJournalParams,
  }),
]

export const textJournalTools = async () => Promise.all(tools)

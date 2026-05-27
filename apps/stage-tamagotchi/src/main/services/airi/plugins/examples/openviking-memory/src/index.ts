import type { ContextInit } from '@proj-airi/plugin-sdk'

import type { OpenVikingClient, OpenVikingClientConfig } from './openviking'

import { moduleConfigurationConfigured } from '@proj-airi/plugin-protocol/types'

import { createOpenVikingClient } from './openviking'

let client: OpenVikingClient | null = null

export async function init({ channels }: ContextInit): Promise<void> {
  channels.host.on(moduleConfigurationConfigured, (event) => {
    const body = event.body as { config: { full?: Partial<OpenVikingClientConfig> } } | undefined
    const config = body?.config?.full
    client = createOpenVikingClient({
      baseUrl: config?.baseUrl ?? 'http://localhost:1933',
      apiKey: config?.apiKey ?? '',
    })
  })
}

export async function setupModules({ apis }: ContextInit): Promise<void> {
  if (!client) {
    throw new Error('OpenViking client not initialized')
  }

  await apis.tools.register({
    tool: {
      id: 'memory_search',
      title: 'Search Memory',
      description: 'Retrieve specific memory entries from long-term storage by contextual keywords, time references, or event descriptions. Use this when you need to recall factual details (what happened, how something was done), temporal information (specific dates, years, months, days, weekends, weeks, or relative timeframes like "last week" or "yesterday"), or scheduled events (appointments, arrangements, calendar entries, or planned activities). Returns matching memory entries with relevance scores and metadata.',
      activation: {
        keywords: ['search', 'find', 'recall', 'look up', 'what', 'when', 'did', 'remember', 'tell me about'],
        patterns: [],
      },
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Natural language search query describing the information to recall, including keywords, time references, event descriptions, or contextual details' },
          limit: { type: 'number', description: 'Maximum number of memory results to return', default: 5 },
        },
        required: ['query'],
      },
    },
    execute: async (input: unknown) => {
      const { query, limit } = input as { query: string, limit?: number }
      const results = await client!.searchMemories(query, limit)
      return { results }
    },
  })

  await apis.tools.register({
    tool: {
      id: 'memory_read',
      title: 'Read Memory',
      description: 'Retrieve the full detailed content of a specific memory entry identified by its URI. Use this when you need to access complete context and details of a previously identified memory item, such as viewing the entire content found through memory_search. This provides the full text and metadata of a single memory entry, as opposed to performing a broader search across memories.',
      activation: {
        keywords: ['read', 'show', 'view', 'get details', 'open', 'display', 'see'],
        patterns: [],
      },
      parameters: {
        type: 'object',
        properties: {
          uri: { type: 'string', description: 'The URI of the memory entry to read (e.g. viking://user/default/...). Obtain this from memory_search results.' },
        },
        required: ['uri'],
      },
    },
    execute: async (input: unknown) => {
      const { uri } = input as { uri: string }
      return await client!.readMemory(uri)
    },
  })

  await apis.tools.register({
    tool: {
      id: 'memory_save',
      title: '保存记忆',
      description: 'Store a piece of important information into long-term memory for future recall. Use this when you need to remember factual details, user preferences, key decisions, follow-up tasks, or any information that should be persisted beyond the current conversation. The saved content can later be retrieved using memory_search. Optionally attach tags for better organization and retrieval.',
      activation: {
        keywords: ['save', 'remember', 'store', 'keep', 'record', 'note', 'add', 'learn'],
        patterns: [],
      },
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'The information content to store in long-term memory' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional tags for categorizing and organizing memory entries for easier retrieval',
          },
        },
        required: ['content'],
      },
    },
    execute: async (input: unknown) => {
      const { content, tags } = input as { content: string, tags?: string[] }
      return await client!.saveMemory(content, tags)
    },
  })

  await apis.tools.register({
    tool: {
      id: 'memory_recall',
      title: 'Recall Memory',
      description: 'Automatically recall long-term memories relevant to the current conversation for context injection. NOTICE: This tool is triggered by the system only and should not be invoked by the AI assistant.',
      activation: {
        keywords: [],
        patterns: [],
      },
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query describing the context to recall from long-term memory' },
          limit: { type: 'number', description: 'Maximum number of memory results to return', default: 5 },
        },
        required: ['query'],
      },
    },
    execute: async (input: unknown) => {
      const { query, limit } = input as { query: string, limit?: number }
      const results = await client!.recallMemories(query, limit)
      return { results }
    },
  })

  await apis.tools.register({
    tool: {
      id: 'memory_save_turn',
      title: 'Save Conversation Turn',
      description: 'Save a conversation turn (user message + assistant response + tool calls) into long-term memory. NOTICE: This tool is triggered by the system only and should not be invoked by the AI assistant.',
      activation: {
        keywords: [],
        patterns: [],
      },
      parameters: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Conversation session ID. Use the same ID for the same conversation; auto-created if not provided' },
          userMessage: { type: 'string', description: 'The user message content' },
          assistantResponse: { type: 'string', description: 'The assistant response content' },
          toolCalls: { type: 'object', description: 'Record of tool calls made during the conversation turn' },
          timestamp: { type: 'string', description: 'ISO 8601 timestamp of the conversation turn' },
        },
        required: ['userMessage', 'assistantResponse', 'timestamp'],
      },
    },
    execute: async (input: unknown) => {
      const turn = input as { sessionId?: string, userMessage: string, assistantResponse: string, toolCalls?: unknown[], timestamp: string }
      return await client!.saveTurn(turn)
    },
  })

  await apis.tools.register({
    tool: {
      id: 'memory_delete',
      title: 'Delete Memory',
      description: 'Permanently and irreversibly remove a specific memory entry from long-term storage. Use this only when you have explicit intent to discard particular information. This action cannot be undone — the deleted memory entry and all its associated data will be erased permanently.',
      activation: {
        keywords: ['delete', 'remove', 'erase', 'forget', 'discard', 'clear'],
        patterns: [],
      },
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The unique identifier of the memory entry to permanently delete' },
        },
        required: ['id'],
      },
    },
    execute: async (input: unknown) => {
      const { id } = input as { id: string }
      await client!.deleteMemory(id)
      return { success: true }
    },
  })
}

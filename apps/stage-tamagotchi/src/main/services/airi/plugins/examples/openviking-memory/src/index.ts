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
      title: '搜索记忆',
      description: '搜索长期记忆中的相关信息',
      activation: {
        keywords: ['记忆', '回忆', '搜索'],
        patterns: [],
      },
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索查询' },
          limit: { type: 'number', description: '返回结果数量', default: 5 },
        },
        required: ['query'],
      },
    },
    execute: async (input: unknown) => {
      const { query, limit } = input as { query: string, limit?: number }
      const results = await client!.searchMemories(query)
      const limited = typeof limit === 'number' ? results.slice(0, limit) : results
      return { results: limited }
    },
  })

  await apis.tools.register({
    tool: {
      id: 'memory_save',
      title: '保存记忆',
      description: '保存一条重要信息到长期记忆',
      activation: {
        keywords: ['记住', '保存', '记忆'],
        patterns: [],
      },
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '要记忆的内容' },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: '标签',
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
      id: 'memory_delete',
      title: '删除记忆',
      description: '删除一条记忆',
      activation: {
        keywords: ['删除', '移除', '清除'],
        patterns: [],
      },
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '要删除的记忆 ID' },
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

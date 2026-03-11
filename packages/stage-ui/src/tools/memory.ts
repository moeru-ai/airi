import { tool } from '@xsai/tool'
import { z } from 'zod'

import { useMemoryLongTermStore } from '../stores/modules/memory-long-term'

function jsonResult(data: unknown) {
  if (typeof data === 'string')
    return data

  try {
    return JSON.stringify(data, null, 2)
  }
  catch {
    return String(data)
  }
}

const tools = [
  tool({
    name: 'memory_store',
    description: 'Store a memory in AIRI long-term memory.',
    execute: async ({ content, tags, metadata }) => {
      try {
        const store = useMemoryLongTermStore()
        const result = await store.storeMemory(content, tags, metadata)
        return jsonResult({ ok: true, data: result })
      }
      catch (error) {
        return jsonResult({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
    parameters: z.object({
      content: z.string().min(1).max(50000),
      tags: z.array(z.string()).max(20).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }).strict(),
  }),
  tool({
    name: 'memory_search',
    description: 'Search AIRI long-term memories by semantic query.',
    execute: async ({ query, limit }) => {
      try {
        const store = useMemoryLongTermStore()
        const result = await store.searchMemories(query, { limit })
        return jsonResult({
          ok: true,
          memories: result,
          total: result.length,
        })
      }
      catch (error) {
        return jsonResult({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
    parameters: z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(20).default(5),
    }).strict(),
  }),
  tool({
    name: 'memory_get',
    description: 'Fetch a single memory by id.',
    execute: async ({ id }) => {
      try {
        const store = useMemoryLongTermStore()
        const result = await store.getMemory(id)
        if (!result) {
          return jsonResult({ ok: false, error: 'memory not found' })
        }
        return jsonResult({ ok: true, data: result })
      }
      catch (error) {
        return jsonResult({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
    parameters: z.object({
      id: z.string().min(1),
    }).strict(),
  }),
  tool({
    name: 'memory_update',
    description: 'Update an existing AIRI long-term memory.',
    execute: async ({ id, content, tags, metadata }) => {
      try {
        const store = useMemoryLongTermStore()
        const result = await store.updateMemory(id, content, tags, metadata)
        if (!result) {
          return jsonResult({ ok: false, error: 'memory not found' })
        }
        return jsonResult({ ok: true, data: result })
      }
      catch (error) {
        return jsonResult({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
    parameters: z.object({
      id: z.string().min(1),
      content: z.string().min(1).optional(),
      tags: z.array(z.string()).max(20).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }).strict(),
  }),
  tool({
    name: 'memory_delete',
    description: 'Delete an AIRI long-term memory by id.',
    execute: async ({ id }) => {
      try {
        const store = useMemoryLongTermStore()
        const deleted = await store.deleteMemory(id)
        if (!deleted) {
          return jsonResult({ ok: false, error: 'memory not found' })
        }
        return jsonResult({ ok: true })
      }
      catch (error) {
        return jsonResult({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    },
    parameters: z.object({
      id: z.string().min(1),
    }).strict(),
  }),
]

export async function memory() {
  if (!useMemoryLongTermStore().enabled) {
    return []
  }

  return Promise.all(tools)
}

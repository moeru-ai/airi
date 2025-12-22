import { defineInvokeEventa } from '@moeru/eventa'
import { z } from 'zod'

/**
 * Memory database IPC events for communication between renderer and main process
 */

// Input/Output schemas for validation
const memoryEntrySchema = z.object({
  id: z.number(),
  type: z.enum(['short-term', 'long-term']),
  content: z.string(),
  timestamp: z.number(),
  metadata: z.string().nullable().optional(),
  embedding: z.string().nullable().optional(),
})

export const memoryDb = {
  initializeDb: defineInvokeEventa<{ success: boolean, dbPath: string }, { customPath?: string }>('eventa:invoke:electron:memory-db:initialize'),
  addMemory: defineInvokeEventa<{ success: boolean, id: number }, { type: 'short-term' | 'long-term', content: string, metadata?: Record<string, any>, embedding?: number[] }>('eventa:invoke:electron:memory-db:add-memory'),
  getMemories: defineInvokeEventa<{ success: boolean, memories: z.infer<typeof memoryEntrySchema>[] }, { type: 'short-term' | 'long-term', limit?: number }>('eventa:invoke:electron:memory-db:get-memories'),
  getRecentMemories: defineInvokeEventa<{ success: boolean, memories: z.infer<typeof memoryEntrySchema>[] }, { limit: number }>('eventa:invoke:electron:memory-db:get-recent-memories'),
  cleanupShortTermMemories: defineInvokeEventa<{ success: boolean }, { keepCount: number }>('eventa:invoke:electron:memory-db:cleanup-short-term'),
  clearAllMemories: defineInvokeEventa<{ success: boolean }>('eventa:invoke:electron:memory-db:clear-all'),
  clearMemoriesByType: defineInvokeEventa<{ success: boolean }, { type: 'short-term' | 'long-term' }>('eventa:invoke:electron:memory-db:clear-by-type'),
  getStats: defineInvokeEventa<{ success: boolean, stats: { total: number, shortTerm: number, longTerm: number } }>('eventa:invoke:electron:memory-db:get-stats'),
  getDatabasePath: defineInvokeEventa<{ success: boolean, path: string }>('eventa:invoke:electron:memory-db:get-path'),
  isInitialized: defineInvokeEventa<{ initialized: boolean }>('eventa:invoke:electron:memory-db:is-initialized'),
}

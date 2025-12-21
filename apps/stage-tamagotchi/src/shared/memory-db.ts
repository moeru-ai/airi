import { createBidirectionalContract } from '@moeru/eventa'
import { z } from 'zod'

/**
 * Memory database IPC contract for communication between renderer and main process
 */
export const memoryDbContract = createBidirectionalContract({
  initializeDb: {
    input: z.object({
      customPath: z.string().optional(),
    }),
    output: z.object({
      success: z.boolean(),
      dbPath: z.string(),
    }),
  },

  addMemory: {
    input: z.object({
      type: z.enum(['short-term', 'long-term']),
      content: z.string(),
      metadata: z.record(z.any()).optional(),
      embedding: z.array(z.number()).optional(),
    }),
    output: z.object({
      success: z.boolean(),
      id: z.number(),
    }),
  },

  getMemories: {
    input: z.object({
      type: z.enum(['short-term', 'long-term']),
      limit: z.number().optional(),
    }),
    output: z.object({
      success: z.boolean(),
      memories: z.array(z.object({
        id: z.number(),
        type: z.enum(['short-term', 'long-term']),
        content: z.string(),
        timestamp: z.number(),
        metadata: z.string().nullable().optional(),
        embedding: z.string().nullable().optional(),
      })),
    }),
  },

  getRecentMemories: {
    input: z.object({
      limit: z.number().default(50),
    }),
    output: z.object({
      success: z.boolean(),
      memories: z.array(z.object({
        id: z.number(),
        type: z.enum(['short-term', 'long-term']),
        content: z.string(),
        timestamp: z.number(),
        metadata: z.string().nullable().optional(),
        embedding: z.string().nullable().optional(),
      })),
    }),
  },

  cleanupShortTermMemories: {
    input: z.object({
      keepCount: z.number().default(20),
    }),
    output: z.object({
      success: z.boolean(),
    }),
  },

  clearAllMemories: {
    input: z.object({}),
    output: z.object({
      success: z.boolean(),
    }),
  },

  clearMemoriesByType: {
    input: z.object({
      type: z.enum(['short-term', 'long-term']),
    }),
    output: z.object({
      success: z.boolean(),
    }),
  },

  getStats: {
    input: z.object({}),
    output: z.object({
      success: z.boolean(),
      stats: z.object({
        total: z.number(),
        shortTerm: z.number(),
        longTerm: z.number(),
      }),
    }),
  },

  getDatabasePath: {
    input: z.object({}),
    output: z.object({
      success: z.boolean(),
      path: z.string(),
    }),
  },

  isInitialized: {
    input: z.object({}),
    output: z.object({
      initialized: z.boolean(),
    }),
  },
})

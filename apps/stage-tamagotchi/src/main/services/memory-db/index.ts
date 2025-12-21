import { createIpcMainService } from '@moeru/eventa/electron-main'

import { memoryDbContract } from '../../../shared/memory-db'
import { getMemoryDatabase } from './database'

/**
 * Setup memory database IPC service in main process
 */
export function setupMemoryDbService() {
  const memoryDb = getMemoryDatabase()

  const service = createIpcMainService({
    contract: memoryDbContract,
    handlers: {
      initializeDb: async ({ customPath }) => {
        try {
          memoryDb.initialize(customPath)
          return {
            success: true,
            dbPath: memoryDb.getDatabasePath(),
          }
        }
        catch (error) {
          console.error('Failed to initialize memory database:', error)
          return {
            success: false,
            dbPath: '',
          }
        }
      },

      addMemory: async ({ type, content, metadata, embedding }) => {
        try {
          const id = memoryDb.addMemory(type, content, metadata, embedding)
          return {
            success: true,
            id,
          }
        }
        catch (error) {
          console.error('Failed to add memory:', error)
          return {
            success: false,
            id: -1,
          }
        }
      },

      getMemories: async ({ type, limit }) => {
        try {
          const memories = memoryDb.getMemories(type, limit)
          return {
            success: true,
            memories,
          }
        }
        catch (error) {
          console.error('Failed to get memories:', error)
          return {
            success: false,
            memories: [],
          }
        }
      },

      getRecentMemories: async ({ limit }) => {
        try {
          const memories = memoryDb.getRecentMemories(limit)
          return {
            success: true,
            memories,
          }
        }
        catch (error) {
          console.error('Failed to get recent memories:', error)
          return {
            success: false,
            memories: [],
          }
        }
      },

      cleanupShortTermMemories: async ({ keepCount }) => {
        try {
          memoryDb.cleanupShortTermMemories(keepCount)
          return {
            success: true,
          }
        }
        catch (error) {
          console.error('Failed to cleanup short-term memories:', error)
          return {
            success: false,
          }
        }
      },

      clearAllMemories: async () => {
        try {
          memoryDb.clearAllMemories()
          return {
            success: true,
          }
        }
        catch (error) {
          console.error('Failed to clear all memories:', error)
          return {
            success: false,
          }
        }
      },

      clearMemoriesByType: async ({ type }) => {
        try {
          memoryDb.clearMemoriesByType(type)
          return {
            success: true,
          }
        }
        catch (error) {
          console.error('Failed to clear memories by type:', error)
          return {
            success: false,
          }
        }
      },

      getStats: async () => {
        try {
          const stats = memoryDb.getStats()
          return {
            success: true,
            stats,
          }
        }
        catch (error) {
          console.error('Failed to get stats:', error)
          return {
            success: false,
            stats: {
              total: 0,
              shortTerm: 0,
              longTerm: 0,
            },
          }
        }
      },

      getDatabasePath: async () => {
        try {
          const path = memoryDb.getDatabasePath()
          return {
            success: true,
            path,
          }
        }
        catch (error) {
          console.error('Failed to get database path:', error)
          return {
            success: false,
            path: '',
          }
        }
      },

      isInitialized: async () => {
        return {
          initialized: memoryDb.isInitialized(),
        }
      },
    },
  })

  return service
}

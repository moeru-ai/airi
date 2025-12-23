import type { createContext } from '@moeru/eventa/adapters/electron/main'

import { defineInvokeHandler } from '@moeru/eventa'

import { memoryDb } from '../../../shared/memory-db'
import { getMemoryDatabase } from './database'

/**
 * Setup memory database IPC service in main process
 */
export function setupMemoryDbService(context: ReturnType<typeof createContext>['context']) {
  const memoryDatabase = getMemoryDatabase()

  defineInvokeHandler(context, memoryDb.initializeDb, async (args) => {
    try {
      memoryDatabase.initialize(args?.customPath)
      return {
        success: true,
        dbPath: memoryDatabase.getDatabasePath(),
      }
    }
    catch (error) {
      console.error('Failed to initialize memory database:', error)
      return {
        success: false,
        dbPath: '',
      }
    }
  })

  defineInvokeHandler(context, memoryDb.addMemory, async (args) => {
    try {
      const id = memoryDatabase.addMemory(args.type, args.content, args.metadata, args.embedding)
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
  })

  defineInvokeHandler(context, memoryDb.getMemories, async (args) => {
    try {
      const memories = memoryDatabase.getMemories(args.type, args.limit)
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
  })

  defineInvokeHandler(context, memoryDb.getRecentMemories, async (args) => {
    try {
      const memories = memoryDatabase.getRecentMemories(args.limit)
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
  })

  defineInvokeHandler(context, memoryDb.cleanupShortTermMemories, async (args) => {
    try {
      memoryDatabase.cleanupShortTermMemories(args.keepCount)
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
  })

  defineInvokeHandler(context, memoryDb.clearAllMemories, async () => {
    try {
      memoryDatabase.clearAllMemories()
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
  })

  defineInvokeHandler(context, memoryDb.clearMemoriesByType, async (args) => {
    try {
      memoryDatabase.clearMemoriesByType(args.type)
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
  })

  defineInvokeHandler(context, memoryDb.getStats, async () => {
    try {
      const stats = memoryDatabase.getStats()
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
  })

  defineInvokeHandler(context, memoryDb.getDatabasePath, async () => {
    try {
      const path = memoryDatabase.getDatabasePath()
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
  })

  defineInvokeHandler(context, memoryDb.isInitialized, async () => {
    return {
      initialized: memoryDatabase.isInitialized(),
    }
  })

  defineInvokeHandler(context, memoryDb.exportDatabase, async () => {
    try {
      const buffer = memoryDatabase.exportDatabase()
      // Convert Buffer to array for IPC transfer
      const data = Array.from(buffer)
      return {
        success: true,
        data,
      }
    }
    catch (error) {
      console.error('Failed to export database:', error)
      return {
        success: false,
        data: [],
      }
    }
  })
}

import { createIpcRendererClient } from '@moeru/eventa/electron-renderer'
import { ref } from 'vue'

import { memoryDbContract } from '../../../shared/memory-db'

/**
 * Composable for using memory database in renderer process
 */
export function useMemoryDb() {
  const client = createIpcRendererClient({ contract: memoryDbContract })
  const isInitialized = ref(false)
  const dbPath = ref('')

  async function initialize(customPath?: string) {
    const result = await client.initializeDb({ customPath })
    isInitialized.value = result.success
    dbPath.value = result.dbPath
    return result
  }

  async function addMemory(
    type: 'short-term' | 'long-term',
    content: string,
    metadata?: Record<string, any>,
    embedding?: number[]
  ) {
    return await client.addMemory({ type, content, metadata, embedding })
  }

  async function getMemories(type: 'short-term' | 'long-term', limit?: number) {
    return await client.getMemories({ type, limit })
  }

  async function getRecentMemories(limit: number = 50) {
    return await client.getRecentMemories({ limit })
  }

  async function cleanupShortTermMemories(keepCount: number = 20) {
    return await client.cleanupShortTermMemories({ keepCount })
  }

  async function clearAllMemories() {
    return await client.clearAllMemories({})
  }

  async function clearMemoriesByType(type: 'short-term' | 'long-term') {
    return await client.clearMemoriesByType({ type })
  }

  async function getStats() {
    return await client.getStats({})
  }

  async function getDatabasePath() {
    return await client.getDatabasePath({})
  }

  async function checkInitialized() {
    const result = await client.isInitialized({})
    isInitialized.value = result.initialized
    return result.initialized
  }

  return {
    isInitialized,
    dbPath,
    initialize,
    addMemory,
    getMemories,
    getRecentMemories,
    cleanupShortTermMemories,
    clearAllMemories,
    clearMemoriesByType,
    getStats,
    getDatabasePath,
    checkInitialized,
  }
}

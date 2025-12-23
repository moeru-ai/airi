import { defineInvoke } from '@moeru/eventa'
import { ref } from 'vue'

import { memoryDb } from '../../../shared/memory-db'

/**
 * Composable for using memory database in renderer process
 */
export function useMemoryDb() {
  const invoke = defineInvoke()
  const isInitialized = ref(false)
  const dbPath = ref('')

  async function initialize(customPath?: string) {
    const result = await invoke(memoryDb.initializeDb, { customPath })
    isInitialized.value = result.success
    dbPath.value = result.dbPath
    return result
  }

  async function addMemory(
    type: 'short-term' | 'long-term',
    content: string,
    metadata?: Record<string, any>,
    embedding?: number[],
  ) {
    return await invoke(memoryDb.addMemory, { type, content, metadata, embedding })
  }

  async function getMemories(type: 'short-term' | 'long-term', limit?: number) {
    return await invoke(memoryDb.getMemories, { type, limit })
  }

  async function getRecentMemories(limit: number = 50) {
    return await invoke(memoryDb.getRecentMemories, { limit })
  }

  async function cleanupShortTermMemories(keepCount: number = 20) {
    return await invoke(memoryDb.cleanupShortTermMemories, { keepCount })
  }

  async function clearAllMemories() {
    return await invoke(memoryDb.clearAllMemories, undefined)
  }

  async function clearMemoriesByType(type: 'short-term' | 'long-term') {
    return await invoke(memoryDb.clearMemoriesByType, { type })
  }

  async function getStats() {
    return await invoke(memoryDb.getStats, undefined)
  }

  async function getDatabasePath() {
    return await invoke(memoryDb.getDatabasePath, undefined)
  }

  async function checkInitialized() {
    const result = await invoke(memoryDb.isInitialized, undefined)
    isInitialized.value = result.initialized
    return result.initialized
  }

  async function exportDatabase() {
    return await invoke(memoryDb.exportDatabase, undefined)
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
    exportDatabase,
  }
}

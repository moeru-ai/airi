/**
 * Memory Service Integration Composable
 *
 * This composable handles:
 * - Sending user messages to memory service
 * - Storing AI responses in memory service
 * - Managing API key authentication
 */
import type { StructuredMemoryContext } from '../types/memory'

import { memoryClient } from '@proj-airi/memory-pgvector'
import { useLocalStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { useAiriCardStore } from '../stores/modules'

export function useMemoryService() {
  const memoryServiceEnabled = useLocalStorage('settings/memory/enabled', true)
  const memoryServiceUrl = useLocalStorage('settings/memory/service-url', 'http://localhost:3001/api')
  const memoryApiKey = useLocalStorage('settings/memory/api-key', '')

  const airiCardStore = useAiriCardStore()
  const { currentModels } = storeToRefs(airiCardStore)

  const activeModelName = computed(() => currentModels.value?.consciousness?.model || 'default')

  const resolveModelName = () => activeModelName.value

  /**
   * Store a user message in the memory service.
   */
  async function storeUserMessage(content: string, platform: string = 'web') {
    try {
      if (!memoryServiceEnabled.value)
        return
      await memoryClient.ingestMessage(content, platform, resolveModelName())
    }
    catch (error) {
      console.warn('Failed to store user message in memory service:', error)
    }
  }

  /**
   * Store an AI response in the memory service.
   */
  async function storeAIResponse(prompt: string, response: string, platform: string = 'web') {
    try {
      if (!memoryServiceEnabled.value)
        return

      await memoryClient.storeCompletion(prompt, response, platform, resolveModelName())
    }
    catch (error) {
      console.warn('Failed to store AI response in memory service:', error)
    }
  }

  /**
   * Test connection to memory service.
   */
  async function testConnection(): Promise<{ success: boolean, message: string }> {
    try {
      if (!memoryServiceEnabled.value) {
        return { success: false, message: 'Memory service integration is disabled' }
      }
      await memoryClient.getContext('test')
      return { success: true, message: 'Memory service is connected' }
    }
    catch (error) {
      return {
        success: false,
        message: `Failed to connect to memory service: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  /**
   * Fetches structured context from the memory service.
   */
  async function fetchStructuredContext(message: string): Promise<StructuredMemoryContext | null> {
    try {
      if (!memoryServiceEnabled.value)
        return null

      return await memoryClient.getStructuredContext(message, resolveModelName())
    }
    catch (error) {
      console.error('Failed to fetch structured context:', error)
      return null
    }
  }

  /**
   * Builds a string context from the memory service.
   */
  async function buildContext(message: string): Promise<string> {
    if (!memoryServiceEnabled.value)
      return ''

    try {
      const context = await memoryClient.getContext(message, resolveModelName())
      return context || ''
    }
    catch (error) {
      console.error('Failed to build context string:', error)
      return ''
    }
  }

  return {
    memoryServiceEnabled,
    memoryServiceUrl,
    memoryApiKey,
    storeUserMessage,
    storeAIResponse,
    testConnection,
    getActiveModelName: resolveModelName,
    fetchStructuredContext,
    buildContext,
  }
}

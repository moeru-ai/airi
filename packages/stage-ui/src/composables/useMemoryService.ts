/**
 * Memory Service Integration Composable
 *
 * This composable handles:
 * - Sending user messages to memory service
 * - Storing AI responses in memory service
 * - Managing API key authentication
 */

// TODO [lucas-oma]: remove console.debug before merging (eslint)

import type { StructuredMemoryContext } from '../types/memory'

import { useLocalStorage } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import {
  buildQueryContext,
  fetchStructuredContext as buildStructuredContext,
  storeAIResponse as storeCompletionLocally,
  storeUserMessage as storeMessageLocally,
  testLocalMemoryConnection,
} from '../services/localMemoryClient'
import { useAiriCardStore } from '../stores/modules'

export function useMemoryService() {
  const memoryServiceEnabled = useLocalStorage('settings/memory/enabled', true)
  const memoryServiceUrl = useLocalStorage('settings/memory/service-url', 'local://pglite')
  const memoryApiKey = useLocalStorage('settings/memory/api-key', '')

  const airiCardStore = useAiriCardStore()
  const { currentModels } = storeToRefs(airiCardStore)

  const activeModelName = computed(() => currentModels.value?.consciousness?.model || 'default')

  const resolveModelName = () => activeModelName.value

  /**
   * Store a user message in the memory service
   * NOTE: Currently not used as messages are stored via /api/context when building context.
   * Keeping this for future streaming service implementation.
   */
  async function storeUserMessage(content: string, platform: string = 'web') {
    try {
      if (!memoryServiceEnabled.value)
        return
      await storeMessageLocally(content, platform, resolveModelName())
    }
    catch (error) {
      console.warn('Failed to store user message in memory service:', error)
    }
  }

  /**
   * Store an AI response in the memory service
   * Note: This requires the memory service to have a completions endpoint
   */
  async function storeAIResponse(prompt: string, response: string, platform: string = 'web') {
    try {
      if (!memoryServiceEnabled.value)
        return

      await storeCompletionLocally(prompt, response, platform, undefined, resolveModelName())
    }
    catch (error) {
      console.warn('Failed to store AI response in memory service:', error)
    }
  }

  /**
   * Test connection to memory service
   */
  async function testConnection(): Promise<{ success: boolean, message: string }> {
    try {
      if (!memoryServiceEnabled.value) {
        return { success: false, message: 'Memory service integration is disabled' }
      }

      await testLocalMemoryConnection()
      return { success: true, message: 'Embedded memory is ready' }
    }
    catch (error) {
      return {
        success: false,
        message: `Failed to initialize embedded memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  async function fetchStructuredContext(message: string): Promise<StructuredMemoryContext | null> {
    try {
      if (!memoryServiceEnabled.value)
        return null

      return await buildStructuredContext(message, resolveModelName())
    }
    catch (error) {
      console.error('Failed to fetch structured context:', error)
      return null
    }
  }

  async function buildContext(message: string): Promise<string> {
    if (!memoryServiceEnabled.value)
      return ''

    try {
      return await buildQueryContext(message, resolveModelName())
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

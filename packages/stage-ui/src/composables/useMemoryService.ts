/**
 * Memory Service Integration Composable
 *
 * This composable handles:
 * - Sending user messages to memory service
 * - Storing AI responses in memory service
 * - Managing API key authentication
 */

// TODO [lucas-oma]: remove console.debug before merging (eslint)

import { useLocalStorage } from '@vueuse/core'

export interface MemoryServiceConfig {
  url: string
  apiKey: string
}

export function useMemoryService() {
  const memoryServiceEnabled = useLocalStorage('settings/memory/enabled', false)
  const memoryServiceUrl = useLocalStorage('settings/memory/service-url', 'http://localhost:3001')
  const memoryApiKey = useLocalStorage('settings/memory/api-key', '')

  /**
   * Store a user message in the memory service
   * NOTE: Currently not used as messages are stored via /api/context when building context.
   * Keeping this for future streaming service implementation.
   */
  async function storeUserMessage(content: string, platform: string = 'web') {
    try {
      // Check if memory service is enabled
      if (!memoryServiceEnabled.value) {
        // console.debug('Memory service integration disabled, skipping message storage')
        return
      }

      if (!memoryServiceUrl.value) {
        // console.debug('Memory service URL not configured, skipping message storage')
        return
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (memoryApiKey.value.trim()) {
        headers.Authorization = `Bearer ${memoryApiKey.value}`
      }

      const response = await fetch(`${memoryServiceUrl.value}/api/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          content,
          platform,
        }),
      })

      if (!response.ok) {
        throw new Error(`Memory service responded with status ${response.status}`)
      }

      // console.debug('User message stored in memory service successfully')
    }
    catch (error) {
      console.warn('Failed to store user message in memory service:', error)
      // Don't throw - we don't want to break the chat flow if memory service fails
    }
  }

  /**
   * Store an AI response in the memory service
   * Note: This requires the memory service to have a completions endpoint
   */
  async function storeAIResponse(prompt: string, response: string, platform: string = 'web') {
    try {
      // Check if memory service is enabled
      if (!memoryServiceEnabled.value) {
        // console.debug('Memory service integration disabled, skipping response storage')
        return
      }

      if (!memoryServiceUrl.value) {
        // console.debug('Memory service URL not configured, skipping response storage')
        return
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (memoryApiKey.value.trim()) {
        headers.Authorization = `Bearer ${memoryApiKey.value}`
      }

      // Use the dedicated completions endpoint
      const result = await fetch(`${memoryServiceUrl.value}/api/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          prompt,
          response,
          platform,
        }),
      })

      if (!result.ok) {
        throw new Error(`Memory service responded with status ${result.status}`)
      }

      // console.debug('AI response stored in memory service successfully')
    }
    catch (error) {
      console.warn('Failed to store AI response in memory service:', error)
      // Don't throw - we don't want to break the chat flow if memory service fails
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

      if (!memoryServiceUrl.value) {
        return { success: false, message: 'Memory service URL not configured' }
      }

      const headers: Record<string, string> = {}
      if (memoryApiKey.value.trim()) {
        headers.Authorization = `Bearer ${memoryApiKey.value}`
      }
      const response = await fetch(`${memoryServiceUrl.value}/api/test-conn`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })

      if (response.ok) {
        return { success: true, message: 'Successfully connected to memory service' }
      }
      else {
        return { success: false, message: `Memory service responded with status ${response.status}` }
      }
    }
    catch (error) {
      return {
        success: false,
        message: `Failed to connect to memory service: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }
    }
  }

  return {
    memoryServiceEnabled,
    memoryServiceUrl,
    memoryApiKey,
    storeUserMessage,
    storeAIResponse,
    testConnection,
  }
}

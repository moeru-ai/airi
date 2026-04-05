import type { SessionContext } from '@proj-airi/visual-chat-protocol'

import type { GatewayClient } from '../client'

import { ref } from 'vue'

export function useSourceSwitch(client: GatewayClient, getSessionId: () => string | null) {
  const switching = ref(false)
  const lastError = ref<string | null>(null)

  /**
   * Switch active source by sourceId.
   */
  async function switchById(sourceId: string): Promise<SessionContext | null> {
    const sessionId = getSessionId()
    if (!sessionId)
      return null

    switching.value = true
    lastError.value = null

    try {
      return await client.switchSource(sessionId, sourceId)
    }
    catch (err) {
      lastError.value = String(err)
      return null
    }
    finally {
      switching.value = false
    }
  }

  /**
   * Switch active source by sourceType string (e.g. 'phone-camera', 'screen-share').
   */
  async function switchByType(sourceType: string): Promise<SessionContext | null> {
    const sessionId = getSessionId()
    if (!sessionId)
      return null

    switching.value = true
    lastError.value = null

    try {
      return await client.switchSource(sessionId, undefined, sourceType)
    }
    catch (err) {
      lastError.value = String(err)
      return null
    }
    finally {
      switching.value = false
    }
  }

  return {
    switching,
    lastError,
    switchById,
    switchByType,
  }
}

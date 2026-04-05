import type { InteractionMode, SessionAccess, SessionContext } from '@proj-airi/visual-chat-protocol'

import type { GatewaySessionAccess } from '../client'

import { onUnmounted, ref, shallowRef } from 'vue'

import { GatewayClient } from '../client'
import { GatewayWsClient } from '../ws-client'

const HTTP_TO_WS_PATTERN = /^http/

export function useVisualChat(gatewayUrl: string) {
  const gatewayToken = ref('')
  const sessionAccess = shallowRef<SessionAccess | null>(null)
  const client = new GatewayClient({
    baseUrl: gatewayUrl,
    getGatewayToken: () => gatewayToken.value,
    getSessionAccess: () => {
      if (!sessionAccess.value)
        return null
      return {
        sessionId: sessionAccess.value.session.sessionId,
        sessionToken: sessionAccess.value.sessionToken,
      } satisfies GatewaySessionAccess
    },
  })
  const wsUrl = `${gatewayUrl.replace(HTTP_TO_WS_PATTERN, 'ws')}/ws`
  const wsClient = new GatewayWsClient(wsUrl, {
    getSessionAccess: (sessionId) => {
      if (!sessionAccess.value || sessionAccess.value.session.sessionId !== sessionId)
        return null
      return {
        sessionId,
        sessionToken: sessionAccess.value.sessionToken,
      }
    },
  })

  const session = shallowRef<SessionContext | null>(null)
  const connected = ref(false)
  const error = ref<string | null>(null)

  wsClient.on('connected', () => {
    connected.value = true
  })
  wsClient.on('disconnected', () => {
    connected.value = false
  })

  wsClient.on('session:state:changed', (ev) => {
    if (session.value && ev.sessionId === session.value.sessionId) {
      const payload = ev.data as { context?: SessionContext }
      if (payload?.context)
        session.value = payload.context
    }
  })

  wsClient.on('session:mode:changed', (ev) => {
    if (session.value && ev.sessionId === session.value.sessionId) {
      const payload = ev.data as { to?: InteractionMode }
      if (payload?.to)
        session.value = { ...session.value, mode: payload.to }
    }
  })

  wsClient.on('source:active:changed', (ev) => {
    if (session.value && ev.sessionId === session.value.sessionId) {
      refreshSession()
    }
  })

  wsClient.on('session:ended', (ev) => {
    if (session.value && ev.sessionId === session.value.sessionId) {
      session.value = null
    }
  })

  async function refreshSession() {
    if (!session.value)
      return
    try {
      session.value = await client.getSession(session.value.sessionId)
    }
    catch { /* session may have ended */ }
  }

  async function createSession() {
    try {
      const bootstrap = await client.bootstrap()
      gatewayToken.value = bootstrap.gatewayToken
      const access = await client.createSession()
      sessionAccess.value = access
      session.value = access.session
      wsClient.connect()
      wsClient.subscribe(access.session.sessionId)
      return access.session
    }
    catch (err) {
      error.value = String(err)
      throw err
    }
  }

  async function endSession() {
    if (session.value) {
      await client.deleteSession(session.value.sessionId)
      session.value = null
      sessionAccess.value = null
    }
    wsClient.disconnect()
  }

  onUnmounted(() => {
    wsClient.disconnect()
  })

  return {
    session,
    connected,
    error,
    client,
    createSession,
    endSession,
    refreshSession,
  }
}

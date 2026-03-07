/**
 * WebSocket client with auto-reconnect and heartbeat.
 */
import { ref } from 'vue'

export type WsStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

export interface WsClientOptions {
  url: string
  onMessage: (data: any) => void
  onStatusChange?: (status: WsStatus) => void
  heartbeatInterval?: number // ms, default 30000
  reconnectMaxDelay?: number // ms, default 30000
}

export function createWsClient(options: WsClientOptions) {
  const { url, onMessage, onStatusChange, heartbeatInterval = 30000, reconnectMaxDelay = 30000 } = options

  const status = ref<WsStatus>('disconnected')
  let ws: WebSocket | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectAttempts = 0
  let intentionalClose = false

  function setStatus(s: WsStatus) {
    status.value = s
    onStatusChange?.(s)
  }

  function startHeartbeat() {
    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }))
      }
    }, heartbeatInterval)
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  function scheduleReconnect() {
    if (intentionalClose)
      return

    const delay = Math.min(1000 * 2 ** reconnectAttempts, reconnectMaxDelay)
    reconnectAttempts++

    reconnectTimer = setTimeout(() => {
      connect()
    }, delay)
  }

  function connect() {
    if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
      return
    }

    intentionalClose = false
    setStatus('connecting')

    try {
      ws = new WebSocket(url)

      ws.onopen = () => {
        reconnectAttempts = 0
        setStatus('connected')
        startHeartbeat()
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'pong')
            return // heartbeat response, ignore
          onMessage(data)
        }
        catch {
          // Ignore parse errors
        }
      }

      ws.onclose = () => {
        stopHeartbeat()
        if (!intentionalClose) {
          setStatus('disconnected')
          scheduleReconnect()
        }
        else {
          setStatus('disconnected')
        }
      }

      ws.onerror = () => {
        setStatus('error')
      }
    }
    catch {
      setStatus('error')
      scheduleReconnect()
    }
  }

  function disconnect() {
    intentionalClose = true
    stopHeartbeat()

    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    if (ws) {
      ws.close()
      ws = null
    }

    setStatus('disconnected')
    reconnectAttempts = 0
  }

  function send(data: any) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data))
      return true
    }
    return false
  }

  function isConnected() {
    return ws?.readyState === WebSocket.OPEN
  }

  return {
    status,
    connect,
    disconnect,
    send,
    isConnected,
  }
}

export type WsClient = ReturnType<typeof createWsClient>

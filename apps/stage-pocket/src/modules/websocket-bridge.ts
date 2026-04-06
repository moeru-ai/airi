import type {
  WebSocketErrorEventLike,
  WebSocketLike,
  WebSocketLikeConstructor,
  WebSocketMessageEventLike,
} from '@proj-airi/server-sdk'

type HostBridgeCommand
  = | { kind: 'connect', id: string, url: string }
    | { kind: 'send', id: string, data: string }
    | { kind: 'close', id: string, code?: number, reason?: string }

type HostBridgeEvent
  = | { kind: 'open', id: string }
    | { kind: 'message', id: string, data: string }
    | { kind: 'error', id: string, message: string }
    | { kind: 'close', id: string, code?: number, reason?: string }

declare global {
  interface Window {
    AiriHostBridge?: {
      postMessage: (payload: string) => void
    }
    webkit?: {
      messageHandlers?: {
        airiHostBridge?: {
          postMessage: (payload: string) => void
        }
      }
    }
    __airiHostBridge?: {
      onNativeMessage?: (payload: string) => void
    }
  }
}

const sockets = new Map<string, HostWebSocket>()

function postBridgeMessage(command: HostBridgeCommand) {
  if (window.AiriHostBridge) {
    window.AiriHostBridge.postMessage(JSON.stringify(command))
    return
  }

  if (window.webkit?.messageHandlers?.airiHostBridge) {
    window.webkit.messageHandlers.airiHostBridge.postMessage(JSON.stringify(command))
    return
  }

  throw new Error('AIRI host websocket bridge is unavailable')
}

function dispatchNativeEvent(payload: string) {
  const event = JSON.parse(payload) as HostBridgeEvent
  const socket = sockets.get(event.id)
  if (!socket) {
    return
  }

  socket.handleNativeEvent(event)
}

class HostWebSocket implements WebSocketLike {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly id = crypto.randomUUID()
  readyState = HostWebSocket.CONNECTING
  onopen?: (event?: unknown) => void
  onmessage?: (event: WebSocketMessageEventLike) => void
  onerror?: (event: WebSocketErrorEventLike | unknown) => void
  onclose?: (event?: unknown) => void

  constructor(url: string) {
    sockets.set(this.id, this)
    postBridgeMessage({
      kind: 'connect',
      id: this.id,
      url,
    })
  }

  send(data: string | ArrayBufferLike | ArrayBufferView) {
    if (typeof data !== 'string') {
      throw new TypeError('HostWebSocket only supports text frames')
    }

    if (this.readyState !== HostWebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }

    postBridgeMessage({
      kind: 'send',
      id: this.id,
      data,
    })
  }

  close(code?: number, reason?: string) {
    if (this.readyState === HostWebSocket.CLOSED) {
      return
    }

    this.readyState = HostWebSocket.CLOSING
    postBridgeMessage({
      kind: 'close',
      id: this.id,
      code,
      reason,
    })
  }

  handleNativeEvent(event: HostBridgeEvent) {
    switch (event.kind) {
      case 'open':
        this.readyState = HostWebSocket.OPEN
        this.onopen?.()
        break

      case 'message':
        this.onmessage?.({ data: event.data })
        break

      case 'error':
        this.onerror?.({ error: new Error(event.message) })
        break

      case 'close':
        this.readyState = HostWebSocket.CLOSED
        sockets.delete(this.id)
        this.onclose?.({ code: event.code, reason: event.reason })
        break
    }
  }
}

export function getHostWebSocketConstructor() {
  if (!window.AiriHostBridge && !window.webkit?.messageHandlers?.airiHostBridge) {
    return undefined
  }

  window.__airiHostBridge = window.__airiHostBridge ?? {}
  window.__airiHostBridge.onNativeMessage = dispatchNativeEvent
  return HostWebSocket as unknown as WebSocketLikeConstructor
}

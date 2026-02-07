import { createContext } from '@moeru/eventa/adapters/websocket/native'

export function createWebSocketHostChannel(webSocket: WebSocket) {
  // TODO: make sure to setup proper event handling on the webSocket
  return createContext(webSocket)
}

export function createWebSocketDataChannel(webSocket: WebSocket) {
  // TODO: make sure to setup proper event handling on the webSocket
  return createContext(webSocket)
}

import { createContext } from '@moeru/eventa/adapters/websocket/native'

/**
 * Creates a control-plane Eventa context backed by a native `WebSocket`.
 *
 * Use when:
 * - A remote plugin talks to the host over a WebSocket transport
 *
 * Expects:
 * - `webSocket` is already connected and managed by the caller
 *
 * Returns:
 * - An Eventa context that can be assigned to the active host channel
 */
export function createWebSocketHostChannel(webSocket: WebSocket) {
  // TODO: make sure to setup proper event handling on the webSocket
  return createContext(webSocket)
}

/**
 * Creates a data-plane Eventa context backed by a native `WebSocket`.
 *
 * Use when:
 * - A remote plugin needs a WebSocket-backed shared data channel
 *
 * Expects:
 * - `webSocket` is already connected and managed by the caller
 *
 * Returns:
 * - An Eventa context that can be assigned to the active data channel
 */
export function createWebSocketDataChannel(webSocket: WebSocket) {
  // TODO: make sure to setup proper event handling on the webSocket
  return createContext(webSocket)
}

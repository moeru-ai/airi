import type { ChannelHost } from '../../../channels/shared'

import type { PluginTransport } from '../../transports'
import { createContext as createInMemoryContext } from '@moeru/eventa'

import { createWebSocketHostChannel } from '../../../channels/remote/websocket'

export * from '../../core'
export * from '../../shared'
export * from '../../transports'
export * from './loaders'

function createNodeWebSocket(url: string, protocols?: string[]): WebSocket {
  const WebSocketConstructor = globalThis.WebSocket

  if (typeof WebSocketConstructor !== 'function') {
    throw new TypeError(
      'Node runtime WebSocket transport requires globalThis.WebSocket. Use Node 22+ or install a WebSocket polyfill before creating the plugin context.',
    )
  }

  return protocols && protocols.length > 0 ? new WebSocketConstructor(url, protocols) : new WebSocketConstructor(url)
}

/**
 * Creates the Eventa context used by node-side plugin host sessions.
 *
 * Use when:
 * - Bootstrapping a node runtime plugin session
 *
 * Expects:
 * - `transport` describes a transport supported by the node runtime
 *
 * Returns:
 * - A node-compatible Eventa context, or throws if the transport is not implemented
 */
export function createPluginContext(transport: PluginTransport): ChannelHost {
  switch (transport.kind) {
    case 'in-memory':
      return createInMemoryContext()
    case 'websocket':
      return createWebSocketHostChannel(createNodeWebSocket(transport.url, transport.protocols))
    case 'node-worker':
      throw new Error('Node worker transport is not implemented yet.')
    case 'electron':
      throw new Error('Electron transport is not implemented yet.')
    case 'web-worker':
      throw new Error('Web worker transport is not available in node runtime.')
    default:
      throw new Error('Unknown plugin transport kind.')
  }
}

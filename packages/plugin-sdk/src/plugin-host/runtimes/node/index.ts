import type { EventContext } from '@moeru/eventa'

import type { PluginTransport } from '../../transports'

import { createContext } from '@moeru/eventa'

export * from '../../core'
export * from '../../shared'
export * from '../../transports'
export * from './loaders'

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
export function createPluginContext(transport: PluginTransport): EventContext<any, any> {
  switch (transport.kind) {
    case 'in-memory':
      return createContext()
    case 'websocket':
      throw new Error('WebSocket transport is not implemented for node runtime yet.')
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

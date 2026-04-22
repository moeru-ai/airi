import type { EventContext } from '@moeru/eventa'

import type { PluginTransport } from '../../transports'

import { createContext } from '@moeru/eventa'

export * from '../../core'
export * from '../../shared'
export * from '../../transports'

/**
 * Creates the Eventa context used by web-side plugin host sessions.
 *
 * Use when:
 * - Bootstrapping a web runtime plugin session
 *
 * Expects:
 * - `transport` describes a transport supported by the web runtime
 *
 * Returns:
 * - A web-compatible Eventa context, or throws if the transport is not implemented
 */
export function createPluginContext(transport: PluginTransport): EventContext<any, any> {
  switch (transport.kind) {
    case 'in-memory':
      return createContext()
    case 'websocket':
      throw new Error('WebSocket transport is not implemented for web runtime yet.')
    case 'web-worker':
      throw new Error('Web worker transport is not implemented yet.')
    case 'node-worker':
      throw new Error('Node worker transport is not available in web runtime.')
    case 'electron':
      throw new Error('Electron transport is not available in web runtime.')
    default:
      throw new Error('Unknown plugin transport kind.')
  }
}

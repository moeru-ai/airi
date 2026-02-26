import type { EventContext } from '@moeru/eventa'

import type { PluginTransport } from '../../transports'

import { createContext } from '@moeru/eventa'

export * from '../../core'
export * from '../../transports'

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

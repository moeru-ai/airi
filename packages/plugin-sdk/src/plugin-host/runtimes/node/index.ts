import type { EventContext } from '@moeru/eventa'

import type { ExtensionHostOptions } from '../../shared/types'
import type { PluginTransport } from '../../transports'

import { createContext } from '@moeru/eventa'

import { ExtensionHost as BaseExtensionHost } from '../../core'
import { createNodeAsyncContext } from './async-context'

export * from '../../api'
export { createNodeAsyncContext } from './async-context'
export * from './loaders'
export { createWorkerRunner } from './worker-runner'
export type { WorkerRunnerOptions } from './worker-runner'

/**
 * The plugin host for Node and Electron. It injects `AsyncLocalStorage` as the injeca async context of a root container.
 */
export class ExtensionHost extends BaseExtensionHost {
  constructor(options: ExtensionHostOptions = {}) {
    super({ ...options, asyncContext: options.asyncContext ?? (options.container ? undefined : createNodeAsyncContext()) })
  }
}

/**
 * Creates the Eventa context used by node-side extension host sessions.
 *
 * Use when:
 * - Bootstrapping a node runtime extension session
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

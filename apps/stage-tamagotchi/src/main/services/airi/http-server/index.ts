import type { ServerManager } from './server-manager/types'

import { createHttpServerManager } from './server-manager'

export interface BuiltInServer {
  start: () => Promise<void>
  stop: () => Promise<void>
}

/**
 * Composes AIRI local HTTP servers behind one lifecycle service.
 *
 * Use when:
 * - Main process needs one start/stop entrypoint for local HTTP services
 *
 * Expects:
 * - Each server follows the `ServerManager` lifecycle contract
 *
 * Returns:
 * - A lifecycle service with ordered startup/shutdown behavior
 */
export function setupBuiltInServer(params: {
  authServer?: ServerManager
  extensionStaticAssetServer?: ServerManager
  servers?: ServerManager[]
}): BuiltInServer {
  const servers = [
    ...(params.authServer ? [params.authServer] : []),
    ...(params.extensionStaticAssetServer ? [params.extensionStaticAssetServer] : []),
    ...(params.servers ?? []),
  ]
  const manager = createHttpServerManager(servers)

  return {
    start: manager.start,
    stop: manager.stop,
  }
}

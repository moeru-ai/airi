import type { ServerManager } from './types'

import { Mutex } from 'async-mutex'

/**
 * Creates an ordered lifecycle manager for AIRI local HTTP servers.
 *
 * Use when:
 * - Multiple standalone HTTP servers must boot together
 * - Shutdown order must run in reverse startup order
 *
 * Expects:
 * - The `servers` list order defines startup order
 * - `start`/`stop` may be called multiple times safely
 *
 * Returns:
 * - An idempotent manager with `start` and `stop`
 */
export function createHttpServerManager(servers: ServerManager[]) {
  let started = false
  const lifecycleMutex = new Mutex()

  return {
    async start() {
      await lifecycleMutex.runExclusive(async () => {
        if (started) {
          return
        }

        for (const server of servers) {
          await server.start()
        }

        started = true
      })
    },
    async stop() {
      await lifecycleMutex.runExclusive(async () => {
        if (!started) {
          return
        }

        for (const server of [...servers].reverse()) {
          await server.stop()
        }

        started = false
      })
    },
  }
}

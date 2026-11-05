import type { AsyncContext } from 'injeca'

import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Creates the injeca async context for Node and Electron.
 *
 * With it, a cleanup that awaits the stop of its own session rejects with `reentrant-dispose` at once.
 */
export function createNodeAsyncContext(): AsyncContext {
  const storage = new AsyncLocalStorage<unknown>()
  return {
    run: (store, fn) => storage.run(store, fn),
    get: () => storage.getStore(),
  }
}

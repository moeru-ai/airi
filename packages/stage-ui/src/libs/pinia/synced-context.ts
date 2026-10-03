import type { SyncedPiniaRuntime } from 'pinia-plugin-synced'
import type { InjectionKey } from 'vue'

import { inject } from 'vue'

/** Shares the installed runtime without importing its transport and election implementation. */
export const injectKeyPiniaSynced: InjectionKey<SyncedPiniaRuntime> = Symbol('stage-synced-pinia-runtime')

/** Returns the synchronization runtime installed by the application's setupSynced plugin. */
export function usePiniaSynced(): SyncedPiniaRuntime {
  const runtime = inject(injectKeyPiniaSynced)
  if (!runtime)
    throw new Error('Pinia synchronization is not installed. Call app.use(synced.vue) first.')
  return runtime
}

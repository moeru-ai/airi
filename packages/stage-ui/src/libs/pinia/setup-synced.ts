import type { PiniaPlugin } from 'pinia'
import type { SyncedPiniaRuntime } from 'pinia-plugin-synced'
import type { InjectionKey, Plugin } from 'vue'

import { createSyncedPiniaPlugin } from 'pinia-plugin-synced'
import { inject } from 'vue'

/** Provides the synchronization runtime installed by {@link setupSynced}. */
export const injectKeyPiniaSynced: InjectionKey<SyncedPiniaRuntime> = Symbol('stage-synced-pinia-runtime')

/**
 * Creates the Vue and Pinia plugins for one Stage synchronization runtime.
 *
 * Install both plugins on the same application. The Vue plugin provides the
 * runtime to components and releases its election channel when the page or
 * Vue application ends.
 */
export function setupSynced(): { pinia: PiniaPlugin, vue: Plugin } {
  const runtime = createSyncedPiniaPlugin({
    namespace: 'airi:stage:pinia',
    // Chat and image-generation actions can outlive the plugin's 30-second
    // default. Keep the timeout aligned with the previous Electron coordinator.
    callTimeout: 5 * 60 * 1000,
    onError(error) {
      console.error('[stage-synced-pinia] Synchronization failed:', error)
    },
  })

  let disposed = false
  const dispose = () => {
    if (disposed)
      return

    disposed = true
    window.removeEventListener('pagehide', dispose)
    runtime.dispose()
  }

  const vue: Plugin = {
    install(app) {
      app.provide(injectKeyPiniaSynced, runtime)
      window.addEventListener('pagehide', dispose, { once: true })
      app.onUnmount(dispose)
    },
  }

  return {
    pinia: runtime.plugin,
    vue,
  }
}

/** Returns the synchronization runtime provided by {@link setupSynced}. */
export function usePiniaSynced(): SyncedPiniaRuntime {
  const runtime = inject(injectKeyPiniaSynced)
  if (!runtime)
    throw new Error('Pinia synchronization is not installed. Call app.use(synced.vue) first.')

  return runtime
}

import { defineStore } from 'pinia'
import { onScopeDispose } from 'vue'

/**
 * Owns renderer-local save barriers. Electron waits for these before it closes
 * a settings window. This registry is neither replicated nor persisted.
 */
export const useSettingsPersistenceStore = defineStore('settings-persistence', () => {
  const writers = new Set<() => Promise<void>>()
  onScopeDispose(() => writers.clear())

  /**
   * Registers a form's save barrier. Keep it registered after unmount if saving
   * fails, so window close can retry. Unregister only after the edits are saved.
   */
  function register(flush: () => Promise<void>) {
    writers.add(flush)
    return () => writers.delete(flush)
  }

  /** Resolves only when all registered forms have saved. A failure blocks close. */
  async function flush() {
    await Promise.all([...writers].map(write => write()))
  }

  return { register, flush }
})

/**
 * Vite-only stub: ui-server-auth runs in a normal browser bundle. `@proj-airi/stage-ui`
 * imports `@capacitor/core` for optional native runtime checks; those paths are dead
 * here but must resolve for Rolldown.
 */
export const Capacitor = {
  getPlatform(): string {
    return 'web'
  },
}

/**
 * `native-auth.ts` calls `registerPlugin` at module load; ui-server-auth never invokes
 * the Pocket native bridge — return a typed no-op implementation.
 */
export function registerPlugin<T>(_name: string): T {
  return {
    authenticate: async () => {
      throw new Error('AiriNativeAuth is not available in the ui-server-auth bundle')
    },
    debugLog: async () => {},
  } as T
}

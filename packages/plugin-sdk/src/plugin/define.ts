import type { Plugin } from './shared'

/**
 * Declares a lazily constructed plugin definition with stable metadata.
 *
 * Use when:
 * - A plugin entrypoint wants to expose metadata and deferred setup together
 *
 * Expects:
 * - `setup` returns a {@link Plugin} object when the host loads the entrypoint
 *
 * Returns:
 * - A serializable plugin definition that loaders can recognize and execute
 */
export function definePlugin(name: string, version: string, setup: () => Promise<Plugin> | Plugin): {
  name: string
  version: string
  setup: () => Promise<Plugin> | Plugin
} {
  return {
    name,
    version,
    setup,
  }
}

import type { ChannelHost } from '../channels/shared'
import type { PluginApis } from './apis/client'

/**
 * Describes the host-provided context injected into plugin hooks.
 *
 * Use when:
 * - Implementing `Plugin.init`
 * - Implementing `Plugin.setupModules`
 *
 * Expects:
 * - `channels.host` is the control-plane Eventa context for the session
 * - `apis` contains the host-bound plugin API surface for that session
 *
 * Returns:
 * - A stable bootstrap object shared across plugin lifecycle hooks
 */
export interface ContextInit {
  channels: {
    host: ChannelHost
  }
  apis: PluginApis
}

/**
 * Defines the hook surface implemented by a plugin module.
 *
 * Use when:
 * - Exporting plugin behavior from a runtime entrypoint
 *
 * Expects:
 * - Hooks are optional, but at least one meaningful hook should be provided by a real plugin
 *
 * Returns:
 * - A plugin lifecycle object consumed by the plugin host loader
 */
export interface Plugin {
  /**
   * Performs plugin initialization against the injected host context.
   *
   * Use when:
   * - The plugin needs to announce state, wait for capabilities, or register resources during boot
   *
   * Expects:
   * - The host has already created the plugin session and bound `initContext`
   *
   * Returns:
   * - `false` to abort startup, or nothing to continue initialization
   */
  init?: (initContext: ContextInit) => Promise<void | undefined | false>
  /**
   * Declares additional modules or bindings after basic initialization.
   *
   * Use when:
   * - The plugin wants to expose dynamic bindings after its initial boot logic
   *
   * Expects:
   * - The host has already created the plugin session and bound `initContext`
   *
   * Returns:
   * - Nothing. The host observes any side effects performed through `initContext.apis`.
   */
  setupModules?: (initContext: ContextInit) => Promise<void | undefined>
}

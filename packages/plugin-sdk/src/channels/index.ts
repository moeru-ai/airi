import type { EventContext } from '@moeru/eventa'

import { createContext } from '@moeru/eventa'

/**
 * Holds the active plugin-sdk channel contexts for the current process.
 *
 * Use when:
 * - Bootstrapping local or remote plugin transports
 * - Reading the current control-plane or data-plane Eventa context
 *
 * Expects:
 * - Callers replace the fallback contexts with a concrete transport during startup
 *
 * Returns:
 * - Mutable host and data channel references shared by the SDK runtime
 */
export const channels = {
  /**
   * Channel for talking to Plugin Host.
   * Can be seen as Control plane.
   *
   * createContext() here is for fallback internal channel preventing undefined access.
   * In real usage, either local/* or remote/* channel implementation should be set as active channel.
   */
  host: createContext(),
  /**
   * Channel for initialized plugin to transmit events to each other, includes plugins, and stage, configurator, etc.
   * Can be seen as Data plane.
   *
   * createContext() here is for fallback internal channel preventing undefined access.
   * In real usage, either local/* or remote/* channel implementation should be set as active channel.
   */
  data: createContext(),
}

/**
 * Replaces the active control-plane channel used to talk to Plugin Host.
 *
 * Use when:
 * - A runtime has created its concrete host transport context
 *
 * Expects:
 * - `context` is compatible with the current plugin transport implementation
 *
 * Returns:
 * - Nothing. Future reads from {@link channels}.host use the provided context.
 */
export function setActiveHostChannel(context: EventContext<any, any>) {
  channels.host = context
}

/**
 * Replaces the active data-plane channel used for plugin-to-plugin or stage messaging.
 *
 * Use when:
 * - A runtime has created its concrete data transport context
 *
 * Expects:
 * - `context` is compatible with the current plugin transport implementation
 *
 * Returns:
 * - Nothing. Future reads from {@link channels}.data use the provided context.
 */
export function setActiveDataChannel(context: EventContext<any, any>) {
  channels.data = context
}

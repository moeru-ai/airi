import type { EventContext } from '@moeru/eventa'

import type { BindingClientBindings } from './bindings'
import type { KitClientBindings } from './kits'

import { createBindings } from './bindings'
import { createKits } from './kits'
import { createResources } from './resources'

/**
 * Collects the host-provided callbacks that back the plugin client API surface.
 *
 * Use when:
 * - Binding `session.apis` to host-owned implementations
 *
 * Expects:
 * - Each optional binding group is supplied when that API family should be available
 *
 * Returns:
 * - A map of callback groups consumed by {@link createApis}
 */
export interface PluginApiBindings {
  kits?: KitClientBindings
  bindings?: BindingClientBindings
}

/**
 * Creates the low-level plugin API surface exposed to plugin code.
 *
 * Use when:
 * - Building host-backed client APIs for kit runtimes
 *
 * Expects:
 * - `ctx` is the Eventa context for the current extension session
 * - `bindings` contains the host-backed callbacks for each enabled API group
 *
 * Returns:
 * - The composed built-in plugin client APIs for resources, kits, and bindings
 */
export function createApis(ctx: EventContext<any, any>, bindings: PluginApiBindings = {}) {
  return {
    ...createResources(ctx),
    kits: createKits(ctx, bindings.kits),
    bindings: createBindings(ctx, bindings.bindings),
  }
}

/**
 * Describes the concrete API object returned by {@link createApis}.
 *
 * Use when:
 * - Typing host-backed client APIs for kit runtimes
 *
 * Expects:
 * - The caller uses the same shape as the runtime-created API object
 *
 * Returns:
 * - The inferred plugin API client surface
 */
export type PluginApis = ReturnType<typeof createApis>
export * from './bindings'
export * from './kits'
export * from './resources'

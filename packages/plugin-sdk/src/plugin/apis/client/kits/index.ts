import type { EventContext } from '@moeru/eventa'

import type { KitCapabilityDescriptor, KitDescriptor } from '../../../../plugin-host/shared'

/**
 * Identifies the bound API call used to list runtime-compatible kits.
 *
 * Use when:
 * - Declaring permissions for `apis.kits.list()`
 *
 * Expects:
 * - Host and plugin agree on this event name
 *
 * Returns:
 * - The permission/event key string for listing kits
 */
export const pluginKitApiListEventName = 'proj-airi:plugin-sdk:apis:client:kits:list'
/**
 * Identifies the bound API call used to read one kit's capability descriptors.
 *
 * Use when:
 * - Declaring permissions for `apis.kits.getCapabilities()`
 *
 * Expects:
 * - Host and plugin agree on this event name
 *
 * Returns:
 * - The permission/event key string for reading kit capabilities
 */
export const pluginKitApiGetCapabilitiesEventName = 'proj-airi:plugin-sdk:apis:client:kits:get-capabilities'
/**
 * Identifies the shared resource namespace that exposes host kit descriptors.
 *
 * Use when:
 * - Declaring read permissions for kit discovery calls
 *
 * Expects:
 * - The host stores kit descriptors under this resource key
 *
 * Returns:
 * - The resource key string for the kit registry
 */
export const pluginKitRegistryResourceKey = 'proj-airi:plugin-sdk:resources:kits'

/**
 * Defines the host-side callbacks needed by the low-level kit client.
 *
 * Use when:
 * - Wiring `session.apis.kits` to host-owned kit registry logic
 *
 * Expects:
 * - `list` returns runtime-filtered kit descriptors
 * - `getCapabilities` returns only the capabilities for the requested kit
 *
 * Returns:
 * - The callback contract consumed by {@link createKits}
 */
export interface KitClientBindings<TKit extends KitDescriptor = KitDescriptor> {
  list: () => Promise<TKit[]> | TKit[]
  getCapabilities: (kitId: string) => Promise<KitCapabilityDescriptor[]> | KitCapabilityDescriptor[]
}

function createMissingBindingError(method: string) {
  return new Error(`Plugin kit API binding missing for \`${method}\`.`)
}

function requireBinding<TBinding>(binding: TBinding | undefined, method: string): TBinding {
  if (!binding) {
    throw createMissingBindingError(method)
  }

  return binding
}

/**
 * Creates the low-level kit client exposed on `session.apis`.
 *
 * Use when:
 * - Building the plugin SDK API object for a specific session
 *
 * Expects:
 * - `bindings` comes from a host that manages kit descriptors
 *
 * Returns:
 * - A minimal `kits.*` client that forwards to the bound host callbacks
 */
export function createKits<TKit extends KitDescriptor = KitDescriptor>(
  _ctx: EventContext<any, any>,
  bindings?: KitClientBindings<TKit>,
) {
  return {
    async list() {
      return await requireBinding(bindings, 'kits.list').list()
    },
    async getCapabilities(kitId: string) {
      return await requireBinding(bindings, 'kits.getCapabilities').getCapabilities(kitId)
    },
  }
}

/**
 * Describes the concrete client object returned by {@link createKits}.
 *
 * Use when:
 * - Typing `apis.kits`
 *
 * Expects:
 * - The caller uses the same method set as the runtime-created kits client
 *
 * Returns:
 * - The inferred kits client surface
 */
export type KitClient = ReturnType<typeof createKits>

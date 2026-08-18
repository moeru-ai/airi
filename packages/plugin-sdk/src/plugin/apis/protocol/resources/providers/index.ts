import { defineInvokeEventa } from '@moeru/eventa'

/**
 * Identifies the control-plane RPC used to list available providers.
 *
 * Use when:
 * - Declaring permissions for provider discovery
 *
 * Expects:
 * - Host and plugin agree on this event name
 *
 * Returns:
 * - The permission/event key string for provider listing
 */
export const protocolListProvidersEventName = 'proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers'
/**
 * Defines the control-plane RPC that returns the current provider list.
 *
 * Use when:
 * - A plugin needs to inspect which providers are currently available
 *
 * Expects:
 * - The host implements the matching invoke handler
 *
 * Returns:
 * - A typed Eventa invoke descriptor for listing provider names
 */
export const protocolListProviders = defineInvokeEventa<{ name: string }[]>(protocolListProvidersEventName)

/**
 * Groups provider-related protocol RPCs into one namespaced object.
 *
 * Use when:
 * - Passing provider protocol helpers around as a single object
 *
 * Expects:
 * - Consumers call `listProviders` for provider discovery
 *
 * Returns:
 * - The provider protocol helper object
 */
export const protocolProviders = {
  listProviders: protocolListProviders,
}

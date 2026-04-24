import type { EventContext } from '@moeru/eventa'

import type { BindingUpdatePatch } from '../../../../plugin-host/runtimes/shared'
import type { BindingRecord } from '../../../../plugin-host/shared'
import type { HostDataRecord } from '../../../../plugin-host/shared/types'

/**
 * Identifies the bound API call used to list host-managed bindings.
 *
 * Use when:
 * - Declaring permissions for `apis.bindings.list()`
 *
 * Expects:
 * - Host and plugin agree on this event name
 *
 * Returns:
 * - The permission/event key string for listing bindings
 */
export const pluginBindingApiListEventName = 'proj-airi:plugin-sdk:apis:client:bindings:list'
/**
 * Identifies the bound API call used to create a new binding record.
 *
 * Use when:
 * - Declaring permissions for `apis.bindings.announce()`
 *
 * Expects:
 * - Host and plugin agree on this event name
 *
 * Returns:
 * - The permission/event key string for announcing bindings
 */
export const pluginBindingApiAnnounceEventName = 'proj-airi:plugin-sdk:apis:client:bindings:announce'
/**
 * Identifies the bound API call used to activate an existing binding.
 *
 * Use when:
 * - Declaring permissions for `apis.bindings.activate()`
 *
 * Expects:
 * - Host and plugin agree on this event name
 *
 * Returns:
 * - The permission/event key string for activating bindings
 */
export const pluginBindingApiActivateEventName = 'proj-airi:plugin-sdk:apis:client:bindings:activate'
/**
 * Identifies the bound API call used to update an existing binding.
 *
 * Use when:
 * - Declaring permissions for `apis.bindings.update()`
 *
 * Expects:
 * - Host and plugin agree on this event name
 *
 * Returns:
 * - The permission/event key string for updating bindings
 */
export const pluginBindingApiUpdateEventName = 'proj-airi:plugin-sdk:apis:client:bindings:update'
/**
 * Identifies the bound API call used to withdraw an existing binding.
 *
 * Use when:
 * - Declaring permissions for `apis.bindings.withdraw()`
 *
 * Expects:
 * - Host and plugin agree on this event name
 *
 * Returns:
 * - The permission/event key string for withdrawing bindings
 */
export const pluginBindingApiWithdrawEventName = 'proj-airi:plugin-sdk:apis:client:bindings:withdraw'
/**
 * Identifies the shared resource namespace that exposes the binding registry.
 *
 * Use when:
 * - Declaring read permissions for `apis.bindings.list()`
 *
 * Expects:
 * - The host stores binding records under this resource key
 *
 * Returns:
 * - The resource key string for the global bindings registry
 */
export const pluginBindingRegistryResourceKey = 'proj-airi:plugin-sdk:resources:bindings'

/**
 * Builds the kit-scoped resource key used for binding write access.
 *
 * Use when:
 * - Declaring per-kit binding permissions
 *
 * Expects:
 * - `kitId` matches the host-registered kit identifier
 *
 * Returns:
 * - The resource key string for bindings owned by the given kit
 */
export function getKitBindingResourceKey(kitId: string) {
  return `proj-airi:plugin-sdk:resources:kits:${kitId}:bindings`
}

/**
 * Describes the payload required to declare a new binding instance.
 *
 * Use when:
 * - Calling `apis.bindings.announce(...)`
 *
 * Expects:
 * - `moduleId` is unique within the host registry
 * - `kitId` and `kitModuleType` identify the higher-level kit contract being bound
 *
 * Returns:
 * - A serializable binding declaration payload
 */
export interface AnnounceBindingInput<C extends HostDataRecord = HostDataRecord> {
  moduleId: string
  kitId: string
  kitModuleType: string
  config: C
}

/**
 * Identifies which binding should transition to the active state.
 *
 * Use when:
 * - Calling `apis.bindings.activate(...)`
 *
 * Expects:
 * - `moduleId` points at an existing host-managed binding
 *
 * Returns:
 * - A minimal activation request payload
 */
export interface ActivateBindingInput {
  moduleId: string
}

/**
 * Describes a partial update to one binding record.
 *
 * Use when:
 * - Calling `apis.bindings.update(...)`
 *
 * Expects:
 * - `moduleId` identifies the existing binding being changed
 * - Any provided patch fields are valid for the target binding
 *
 * Returns:
 * - A serializable binding update payload
 */
export interface UpdateBindingInput<C extends HostDataRecord = HostDataRecord> extends BindingUpdatePatch<C> {
  moduleId: string
}

/**
 * Identifies which binding should transition to the withdrawn state.
 *
 * Use when:
 * - Calling `apis.bindings.withdraw(...)`
 *
 * Expects:
 * - `moduleId` points at an existing host-managed binding
 *
 * Returns:
 * - A minimal withdrawal request payload
 */
export interface WithdrawBindingInput {
  moduleId: string
}

/**
 * Defines the host-side callbacks needed by the low-level bindings client.
 *
 * Use when:
 * - Wiring `session.apis.bindings` to host-owned registry logic
 *
 * Expects:
 * - Each callback returns the cloned binding record state observed by plugin code
 *
 * Returns:
 * - The callback contract consumed by {@link createBindings}
 */
export interface BindingClientBindings<C extends HostDataRecord = HostDataRecord> {
  list: () => Promise<BindingRecord<C>[]> | BindingRecord<C>[]
  announce: (input: AnnounceBindingInput<C>) => Promise<BindingRecord<C>> | BindingRecord<C>
  activate: (input: ActivateBindingInput) => Promise<BindingRecord<C>> | BindingRecord<C>
  update: (input: UpdateBindingInput<C>) => Promise<BindingRecord<C>> | BindingRecord<C>
  withdraw: (input: WithdrawBindingInput) => Promise<BindingRecord<C>> | BindingRecord<C>
}

function createMissingBindingError(method: string) {
  return new Error(`Plugin binding API binding missing for \`${method}\`.`)
}

function requireBinding<TBinding>(binding: TBinding | undefined, method: string): TBinding {
  if (!binding) {
    throw createMissingBindingError(method)
  }

  return binding
}

/**
 * Creates the low-level bindings client exposed on `session.apis`.
 *
 * Use when:
 * - Building the plugin SDK API object for a specific session
 *
 * Expects:
 * - `bindings` comes from a host that manages binding records
 *
 * Returns:
 * - A minimal `bindings.*` client that forwards to the bound host callbacks
 */
export function createBindings<C extends HostDataRecord = HostDataRecord>(
  _ctx: EventContext<any, any>,
  bindings?: BindingClientBindings<C>,
) {
  return {
    async list() {
      return await requireBinding(bindings, 'bindings.list').list()
    },
    async announce(input: AnnounceBindingInput<C>) {
      return await requireBinding(bindings, 'bindings.announce').announce(input)
    },
    async activate(input: ActivateBindingInput) {
      return await requireBinding(bindings, 'bindings.activate').activate(input)
    },
    async update(input: UpdateBindingInput<C>) {
      return await requireBinding(bindings, 'bindings.update').update(input)
    },
    async withdraw(input: WithdrawBindingInput) {
      return await requireBinding(bindings, 'bindings.withdraw').withdraw(input)
    },
  }
}

/**
 * Describes the concrete client object returned by {@link createBindings}.
 *
 * Use when:
 * - Typing `apis.bindings`
 *
 * Expects:
 * - The caller uses the same method set as the runtime-created bindings client
 *
 * Returns:
 * - The inferred bindings client surface
 */
export type BindingClient = ReturnType<typeof createBindings>

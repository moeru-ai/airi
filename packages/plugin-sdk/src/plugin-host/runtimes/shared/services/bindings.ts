import type { BindingRecord, BindingState } from '../../../shared/bindings'
import type { HostDataRecord, PluginRuntime } from '../../../shared/types'

/**
 * Declares the host-owned data needed to create one binding record.
 *
 * Use when:
 * - A plugin session contributes a concrete runtime instance through a kit
 * - Higher-level kit helpers need to persist their low-level binding into the host registry
 *
 * Expects:
 * - `moduleId` is stable within the owning plugin session
 * - `kitId` points at a host-registered kit that defines the binding family
 * - `kitModuleType` is a kit-defined subtype key, not a host-wide enum
 * - `config` is transport-safe and already normalized by the caller
 *
 * Returns:
 * - A serializable payload that {@link BindingsRegistryService.bind} stores as canonical binding state
 */
export interface BindingInput<C extends HostDataRecord = HostDataRecord> {
  moduleId: string
  ownerSessionId: string
  ownerPluginId: string
  kitId: string
  kitModuleType: string
  runtime: PluginRuntime
  config: C
}

/**
 * Describes an incremental change to a binding record.
 *
 * Use when:
 * - A kit-specific API needs to change binding lifecycle state
 * - A plugin updates binding configuration after initial registration
 *
 * Expects:
 * - `state` follows the host lifecycle rules for the current record
 * - `config` only contains fields that should be shallow-merged into the current config
 *
 * Returns:
 * - A partial mutation applied by {@link BindingsRegistryService.update} or {@link BindingsRegistryService.transition}
 */
export interface BindingUpdatePatch<C extends HostDataRecord = HostDataRecord> {
  state?: BindingState
  config?: Partial<C>
}

/**
 * Identifies the plugin session that owns a binding record.
 *
 * Use when:
 * - Enforcing that only the original plugin session mutates or removes a binding
 * - Comparing current callers against stored binding ownership
 *
 * Expects:
 * - `ownerSessionId` is the ephemeral runtime session id
 * - `ownerPluginId` is the stable plugin identity across sessions
 *
 * Returns:
 * - A compact identity tuple used in collision and ownership checks
 */
export interface BindingOwnerIdentity {
  ownerSessionId: string
  ownerPluginId: string
}

const allowedBindingTransitions: Record<BindingState, readonly BindingState[]> = {
  announced: ['active', 'degraded', 'withdrawn'],
  active: ['degraded', 'withdrawn', 'active'],
  degraded: ['active', 'withdrawn', 'degraded'],
  withdrawn: ['withdrawn'],
}

function createOwnershipError(
  moduleId: string,
  expected: BindingOwnerIdentity,
  actual: BindingOwnerIdentity,
) {
  return new Error(
    `Ownership violation for module \`${moduleId}\`: owned by \`${expected.ownerSessionId}/${expected.ownerPluginId}\`, not \`${actual.ownerSessionId}/${actual.ownerPluginId}\`.`,
  )
}

function createModuleCollisionError(
  moduleId: string,
  expected: BindingOwnerIdentity,
  actual: BindingOwnerIdentity,
) {
  return new Error(
    `Module id collision for \`${moduleId}\`: owned by \`${expected.ownerSessionId}/${expected.ownerPluginId}\`, not \`${actual.ownerSessionId}/${actual.ownerPluginId}\`.`,
  )
}

function createInvalidTransitionError(moduleId: string, from: BindingState, to: BindingState) {
  return new Error(`Invalid binding lifecycle transition for \`${moduleId}\`: \`${from}\` -> \`${to}\`.`)
}

/**
 * Stores the host's canonical binding records for dynamically contributed kit instances.
 *
 * Use when:
 * - A plugin contributes runtime instances through higher-level kit APIs
 * - The host needs an ownership-aware registry that tracks lifecycle and config for those instances
 * - Adapters, permission checks, and debug tooling need one authoritative binding table
 *
 * Expects:
 * - Callers treat a binding as the low-level host record behind a higher-level contribution API
 * - Kits define the meaning of `kitModuleType` and validate kit-specific config outside this service
 * - Binding ids stay unique per owner and are reused intentionally, not accidentally
 *
 * Returns:
 * - Stable {@link BindingRecord} snapshots representing bound runtime contributions
 *
 * A binding is the concrete link between a plugin-owned runtime instance and a host-registered kit.
 * The host keeps kits generic: a kit only describes capabilities, supported runtimes, and allowed
 * operations. That is not enough to render UI, route lifecycle, or enforce ownership for a specific
 * plugin contribution. The missing piece is a binding record saying:
 *
 * - plugin session `X` owns runtime instance `moduleId`
 * - that instance is attached to kit `kitId`
 * - within that kit it behaves as subtype `kitModuleType`
 * - here is its current generic config payload and lifecycle state
 *
 * Why kits require bindings:
 *
 * - Multiple plugins can use the same kit at the same time, so the host needs per-instance records.
 * - Permission checks are kit-scoped, but ownership and lifecycle are instance-scoped.
 * - Surface adapters need something concrete to mount, update, degrade, or withdraw.
 *
 * Higher-level kit APIs should normally sit on top of this service instead of exposing it directly.
 * For example, a future `createWidgetApi(ctx)` could call `bind(...)`, `activate(...)`, and `update(...)`
 * internally while presenting a simpler `register('widget-1')` API to plugin authors. In that model:
 *
 * - kits define the contract
 * - bindings persist concrete instances of that contract
 * - adapters consume binding records to produce UI/runtime behavior
 *
 * This is similar to VS Code's contribution system in spirit, but not in exact mechanics. VS Code uses
 * declarative contribution points in extension manifests and the host interprets them at load time. AIRI's
 * binding registry is more runtime-oriented:
 *
 * - contributions can appear after startup
 * - they can transition through host-managed lifecycle states
 * - they are session-owned and can be withdrawn or rebound on reload
 *
 * Examples:
 *
 * 1. One plugin binds once:
 *    - before: `{}`
 *    - `bind({ moduleId: 'widget-main', kitId: 'kit.widget', kitModuleType: 'window', ... })`
 *    - after: `{ 'widget-main' => { state: 'announced', revision: 1, ... } }`
 *
 * 2. The same plugin binds the same id again:
 *    - before: `{ 'widget-main' => { state: 'announced', revision: 1, runtime: 'electron' } }`
 *    - `bind(...)` with the same owner but different config
 *    - after: unchanged record is returned. This preserves idempotency and prevents silent mutation during rebind.
 *
 * 3. Another plugin tries to bind the same id:
 *    - before: `{ 'widget-main' => owned by session-a/plugin-a }`
 *    - `bind(...)` from session-b/plugin-b
 *    - after: throws collision error, registry remains unchanged
 *
 * 4. One plugin binds many times under one kit:
 *    - `widget-main`, `widget-sidebar`, `widget-dialog`
 *    - after: three binding records, all under `kit.widget`, each with independent lifecycle and config
 *
 * 5. One plugin binds across multiple kits:
 *    - `chat-sidebar` under `kit.chat`
 *    - `widget-main` under `kit.widget`
 *    - after: one registry, multiple kit families, each record still resolved by the same ownership rules
 */
export class BindingsRegistryService<C extends HostDataRecord = HostDataRecord> {
  private readonly bindings = new Map<string, BindingRecord<C>>()

  /**
   * Creates or reuses one binding record for a plugin-owned runtime instance.
   *
   * Use when:
   * - A plugin or kit helper needs to declare that a concrete instance now exists
   * - Rebinding the same id from the same owner should behave idempotently
   *
   * Expects:
   * - `input` already identifies the intended owner and kit family
   * - Rebinding the same id from a different owner is a collision
   *
   * Returns:
   * - The newly stored binding record, or the existing record for idempotent same-owner rebinding
   */
  bind(input: BindingInput<C>) {
    const current = this.bindings.get(input.moduleId)
    if (current) {
      if (
        current.ownerSessionId !== input.ownerSessionId
        || current.ownerPluginId !== input.ownerPluginId
      ) {
        throw createModuleCollisionError(
          input.moduleId,
          {
            ownerSessionId: current.ownerSessionId,
            ownerPluginId: current.ownerPluginId,
          },
          {
            ownerSessionId: input.ownerSessionId,
            ownerPluginId: input.ownerPluginId,
          },
        )
      }

      return current
    }

    const record: BindingRecord<C> = {
      moduleId: input.moduleId,
      ownerSessionId: input.ownerSessionId,
      ownerPluginId: input.ownerPluginId,
      kitId: input.kitId,
      kitModuleType: input.kitModuleType,
      state: 'announced',
      runtime: input.runtime,
      revision: 1,
      updatedAt: Date.now(),
      config: input.config,
    }

    this.bindings.set(record.moduleId, record)
    return record
  }

  /**
   * Looks up one binding record by its runtime instance id.
   *
   * Use when:
   * - Higher-level host flows need to inspect the current canonical binding state
   *
   * Expects:
   * - `moduleId` is a binding id previously created by {@link bind}
   *
   * Returns:
   * - The stored binding record, or `undefined` if it does not exist
   */
  get(moduleId: string) {
    return this.bindings.get(moduleId)
  }

  /**
   * Checks whether the registry currently contains a binding id.
   *
   * Use when:
   * - Callers need a quick existence check before a larger operation
   *
   * Expects:
   * - `moduleId` is the binding id to inspect
   *
   * Returns:
   * - `true` when the binding exists in the registry
   */
  has(moduleId: string) {
    return this.bindings.has(moduleId)
  }

  /**
   * Lists every binding record currently tracked by the host.
   *
   * Use when:
   * - Debug tools, snapshots, or adapters need the full binding table
   *
   * Expects:
   * - Callers treat the returned array as a read-only snapshot
   *
   * Returns:
   * - All stored binding records in insertion order
   */
  list() {
    return [...this.bindings.values()]
  }

  /**
   * Lists bindings owned by one plugin session.
   *
   * Use when:
   * - Stopping or reloading a session
   * - Inspecting one plugin's currently active contributions
   *
   * Expects:
   * - `ownerSessionId` is the session-scoped owner id stored in each binding
   *
   * Returns:
   * - All binding records whose owner session matches the input
   */
  listByOwner(ownerSessionId: string) {
    return this.list().filter(binding => binding.ownerSessionId === ownerSessionId)
  }

  /**
   * Lists bindings attached to one kit family.
   *
   * Use when:
   * - A kit adapter needs to enumerate all currently bound instances
   * - Debug tooling needs to inspect one kit's contribution footprint
   *
   * Expects:
   * - `kitId` matches the `kitId` stored on each binding record
   *
   * Returns:
   * - All binding records attached to the requested kit
   */
  listByKit(kitId: string) {
    return this.list().filter(binding => binding.kitId === kitId)
  }

  /**
   * Applies a shallow config and/or state update to an existing binding.
   *
   * Use when:
   * - A kit helper wants to mutate config after the initial bind
   * - A caller wants transition semantics and config merge in one operation
   *
   * Expects:
   * - The caller owns the binding
   * - Any requested `state` is valid from the current lifecycle state
   *
   * Returns:
   * - The updated binding record with incremented revision and timestamp
   */
  update(ownerSessionId: string, ownerPluginId: string, moduleId: string, patch: BindingUpdatePatch<C>) {
    return this.transition({ ownerSessionId, ownerPluginId }, moduleId, patch.state, patch)
  }

  /**
   * Transitions a bound instance into the `active` lifecycle state.
   *
   * Use when:
   * - The host or a higher-level kit API has completed setup for a bound instance
   *
   * Expects:
   * - The binding exists and is owned by the caller
   *
   * Returns:
   * - The updated active binding record
   */
  activate(ownerSessionId: string, ownerPluginId: string, moduleId: string) {
    return this.transition({ ownerSessionId, ownerPluginId }, moduleId, 'active')
  }

  /**
   * Transitions a bound instance into the `degraded` lifecycle state.
   *
   * Use when:
   * - A previously healthy binding loses a dependency or adapter guarantee
   *
   * Expects:
   * - The binding exists and is owned by the caller
   *
   * Returns:
   * - The updated degraded binding record
   */
  degrade(ownerSessionId: string, ownerPluginId: string, moduleId: string) {
    return this.transition({ ownerSessionId, ownerPluginId }, moduleId, 'degraded')
  }

  /**
   * Transitions a bound instance into the `withdrawn` lifecycle state.
   *
   * Use when:
   * - A plugin wants the host to stop treating a binding as live before eventual removal
   *
   * Expects:
   * - The binding exists and is owned by the caller
   *
   * Returns:
   * - The updated withdrawn binding record
   */
  withdraw(ownerSessionId: string, ownerPluginId: string, moduleId: string) {
    return this.transition({ ownerSessionId, ownerPluginId }, moduleId, 'withdrawn')
  }

  /**
   * Performs the shared ownership checks and lifecycle transition logic for one binding.
   *
   * Use when:
   * - A caller needs a custom lifecycle transition beyond the convenience helpers
   *
   * Expects:
   * - `owner` matches the stored binding owner
   * - `state`, when provided, is legal from the current lifecycle state
   *
   * Returns:
   * - The next canonical binding record written back into the registry
   */
  transition(
    owner: BindingOwnerIdentity,
    moduleId: string,
    state?: BindingState,
    patch: BindingUpdatePatch<C> = {},
  ) {
    const current = this.bindings.get(moduleId)
    if (!current) {
      throw new Error(`Module \`${moduleId}\` was not found.`)
    }

    if (
      current.ownerSessionId !== owner.ownerSessionId
      || current.ownerPluginId !== owner.ownerPluginId
    ) {
      throw createOwnershipError(
        moduleId,
        {
          ownerSessionId: current.ownerSessionId,
          ownerPluginId: current.ownerPluginId,
        },
        owner,
      )
    }

    const nextState = state ?? current.state
    if (!allowedBindingTransitions[current.state].includes(nextState)) {
      throw createInvalidTransitionError(moduleId, current.state, nextState)
    }

    const next: BindingRecord<C> = {
      ...current,
      state: nextState,
      revision: current.revision + 1,
      updatedAt: Date.now(),
      config: patch.config ? ({ ...current.config, ...patch.config } as C) : current.config,
    }

    this.bindings.set(moduleId, next)
    return next
  }

  /**
   * Physically removes a withdrawn-or-obsolete binding record from the registry.
   *
   * Use when:
   * - Stopping or reloading a plugin session after lifecycle cleanup
   * - The host wants to forget a binding entirely, not merely mark it withdrawn
   *
   * Expects:
   * - The caller owns the binding being removed
   * - Callers normally withdraw first, then unbind during teardown
   *
   * Returns:
   * - The removed binding record, or `undefined` when nothing existed
   */
  unbind(ownerSessionId: string, ownerPluginId: string, moduleId: string) {
    const current = this.bindings.get(moduleId)
    if (!current) {
      return undefined
    }

    if (
      current.ownerSessionId !== ownerSessionId
      || current.ownerPluginId !== ownerPluginId
    ) {
      throw createOwnershipError(
        moduleId,
        {
          ownerSessionId: current.ownerSessionId,
          ownerPluginId: current.ownerPluginId,
        },
        {
          ownerSessionId,
          ownerPluginId,
        },
      )
    }

    this.bindings.delete(moduleId)
    return current
  }
}

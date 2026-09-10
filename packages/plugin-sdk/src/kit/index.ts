import type { Disposable, DisposableStore } from '../extension/disposable'

import { KitUnavailableError } from './errors'

export type ExposePolicy = 'local-only' | 'remote-observable' | 'remote-callable'

declare const kitClientType: unique symbol

/**
 * Host-provided runtime values used to create a scope-aware Kit client.
 */
export interface KitClientRuntime {
  /** Stable extension id. */
  extensionId: string
  /** Host-assigned extension session id. */
  sessionId: string
  /** Stable module id when the kit client is created for an explicit module scope. */
  moduleId?: string
  /** Cleanup store for the current extension or module scope. */
  subscriptions: DisposableStore
}

/**
 * Defines the shared contract for one Kit API.
 *
 * Kits that support remote use should expose kit-owned Eventa API contracts
 * such as `gameletKitApis`, then build local and remote clients with the same
 * authoring shape. Keep transport/RPC words out of the author-facing client:
 * authors should use `gamelets.mount(...)`, not `invokeGameletMount(...)`.
 *
 * @param TClient Kit client type returned to extension authors.
 */
export interface KitContract<TClient> {
  /** Stable kit id. */
  id: string
  /** Kit API version used for compatibility checks. */
  version: string
  /** Exposure policies this kit can support across host/peer boundaries. */
  allowedExposePolicies?: ExposePolicy[]
  /** Default exposure policy when module/host policy does not override it. */
  defaultExposePolicy?: ExposePolicy
  /** Keeps the client type in this type-only contract. */
  readonly [kitClientType]?: (client: TClient) => TClient
}

/**
 * Defines a Kit implementation that a Host or Provider Extension can register.
 *
 * @typeParam TClient Client type returned to Consumer Extensions.
 */
export interface KitRef<TClient> extends KitContract<TClient> {
  /** Creates a scope-aware client for this kit. */
  createClient: (runtime: KitClientRuntime) => TClient
}

export type KitUnavailableReason = 'missing-kit' | 'permission-denied' | 'incompatible-version' | 'not-ready'

export type KitUseResult<TClient>
  = | { ok: true, client: TClient }
    | { ok: false, reason: KitUnavailableReason, error: Error }

export type KitAvailability<TClient>
  = | { available: true, kit: KitContract<TClient>, client: TClient }
    | { available: false, kit: KitContract<TClient>, reason: KitUnavailableReason, error: Error }

/**
 * Defines the shared identity and client type for a Kit.
 *
 * Provider Extensions add an implementation with {@link defineKit}. Consumer
 * Extensions use this contract with `ctx.kits.use(...)`.
 *
 * @typeParam TClient Client type returned to Consumer Extensions.
 */
export function defineKitContract<TClient>(contract: KitContract<TClient>): KitContract<TClient> {
  return contract
}

/**
 * Defines a Kit implementation.
 *
 * Use when:
 * - Implementing a Host-provided or Extension-hosted Kit API
 * - Registering the implementation with the Host or `ctx.kits.provide(...)`
 *
 * Expects:
 * - `id` is stable across versions
 * - `createClient` returns an extension- or module-scoped API object
 *
 * Returns:
 * - The Kit implementation registered by a Host or Provider Extension
 */
export function defineKit<TClient>(kit: KitRef<TClient>): KitRef<TClient> {
  return kit
}

/**
 * Creates a standard failed result for optional kit usage.
 *
 * Use when:
 * - Implementing `ctx.kits.tryUse(...)` or optional module-scoped kit usage
 * - Returning a typed reason without throwing
 *
 * Expects:
 * - `reason` describes the host-side availability decision
 *
 * Returns:
 * - A discriminated failure result with `KitUnavailableError`
 */
export function kitUseFailure<TClient>(
  kit: KitContract<TClient>,
  reason: KitUnavailableReason,
): Extract<KitUseResult<TClient>, { ok: false }> {
  return {
    ok: false,
    reason,
    error: new KitUnavailableError(kit.id, reason),
  }
}

export type { Disposable }
export * from './errors'

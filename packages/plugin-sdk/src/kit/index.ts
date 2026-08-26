import type { Disposable, DisposableStore } from '../extension/disposable'

import { KitUnavailableError } from './errors'

export type ExposePolicy = 'local-only' | 'remote-callable' | 'remote-observable'

export type KitAvailability<TClient>
  = | { available: false, error: Error, kit: KitRef<TClient>, reason: KitUnavailableReason }
    | { available: true, client: TClient, kit: KitRef<TClient> }

/**
 * Host-provided runtime values used to create a scope-aware kit client.
 */
export interface KitClientRuntime {
  /** Stable extension id. */
  extensionId: string
  /** Stable module id when the kit client is created for an explicit module scope. */
  moduleId?: string
  /** Host-assigned extension session id. */
  sessionId: string
  /** Cleanup store for the current extension or module scope. */
  subscriptions: DisposableStore
}

/**
 * Defines one kit API surface available to extension setup and optional module scopes.
 *
 * Kits that support remote use should expose kit-owned Eventa API contracts
 * such as `gameletKitApis`, then build local and remote clients with the same
 * authoring shape. Keep transport/RPC words out of the author-facing client:
 * authors should use `gamelets.mount(...)`, not `invokeGameletMount(...)`.
 *
 * @param TClient Kit client type returned to extension authors.
 */
export interface KitRef<TClient> {
  /** Exposure policies this kit can support across host/peer boundaries. */
  allowedExposePolicies?: ExposePolicy[]
  /** Creates a scope-aware client for this kit. */
  createClient: (runtime: KitClientRuntime) => TClient
  /** Default exposure policy when module/host policy does not override it. */
  defaultExposePolicy?: ExposePolicy
  /** Stable kit id. */
  id: string
  /** Kit API version used for compatibility checks. */
  version: string
}

export type KitUnavailableReason = 'incompatible-version' | 'missing-kit' | 'not-ready' | 'permission-denied'

export type KitUseResult<TClient>
  = | { client: TClient, ok: true }
    | { error: Error, ok: false, reason: KitUnavailableReason }

/**
 * Defines a kit reference.
 *
 * Use when:
 * - Implementing a host-provided or extension-provided kit API surface
 * - Publishing a typed kit that extensions can pass to `ctx.kits.use(...)`
 *
 * Expects:
 * - `id` is stable across versions
 * - `createClient` returns an extension- or module-scoped API object
 *
 * Returns:
 * - The kit reference consumed by host kit registries, extension setup, and optional module scopes
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
  kit: KitRef<TClient>,
  reason: KitUnavailableReason,
): Extract<KitUseResult<TClient>, { ok: false }> {
  return {
    error: new KitUnavailableError(kit.id, reason),
    ok: false,
    reason,
  }
}

export type { Disposable }
export * from './errors'

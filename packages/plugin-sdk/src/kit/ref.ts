import type { Disposable, DisposableStore } from '../extension/disposable'
import type { KitUnavailableReason } from './errors'
import type { ExposePolicy } from './exposure-policy'

import { KitUnavailableError } from './errors'

/** The identity of a Host listener event. Any object with a string `id` works, for example an eventa definition. */
export interface KitListenerEvent {
  readonly id: string
}

/**
 * Host-provided runtime values used to create a scope-aware kit client.
 */
export interface KitClientRuntime {
  /** Stable extension id. */
  extensionId: string
  /** Host-assigned extension session id. */
  sessionId: string
  /** Stable module id when the kit client is created for an explicit module scope. */
  moduleId?: string
  /** Cleanup store for the current extension or module scope. It lives as long as the client. */
  subscriptions: DisposableStore
  /**
   * Registers a Host listener that the consumer scope owns. The Host removes it when the scope unloads.
   * Host Kits use it for hooks, for example the harness Kit. It is absent outside a Host.
   */
  listen?: <THandler extends (...args: never[]) => unknown>(event: KitListenerEvent, handler: THandler, metadata?: Readonly<Record<string, unknown>>) => () => void
}

/**
 * Creates one Consumer-scoped Client without an implicit receiver.
 *
 * @param TClient Client type returned to the Extension.
 */
export type HostClientFactory<TClient> = (
  this: void,
  runtime: KitClientRuntime,
) => TClient

/**
 * Defines one trusted Host Kit API surface available to Extension setup and module scopes.
 *
 * A remote Kit exposes a Kit-owned Eventa contract, such as `gameletKitApis`.
 * Local and remote clients use the same authoring shape. Keep transport words
 * out of the author-facing Client. Authors use `gamelets.mount(...)`, not
 * `invokeGameletMount(...)`.
 *
 * @param TClient Kit client type returned to extension authors.
 */
export interface KitRef<TClient> {
  /** Stable kit id. */
  readonly id: string
  /** Kit API version used for compatibility checks. */
  readonly version: string
  /** Exposure policies this kit can support across host/peer boundaries. */
  readonly allowedExposePolicies?: readonly ExposePolicy[]
  /** Default exposure policy when module/host policy does not override it. */
  readonly defaultExposePolicy?: ExposePolicy
  /** Creates a scope-aware client for this kit. */
  readonly createClient: HostClientFactory<TClient>
}

export type { KitUnavailableReason }

export type KitUseResult<TClient>
  = | { ok: true, client: TClient }
    | { ok: false, reason: KitUnavailableReason, error: Error }

/** The identity part of a Kit reference that availability results carry. */
export interface KitIdentity {
  readonly id: string
  readonly version: string
}

export type KitAvailability<TClient>
  = | { available: true, kit: KitIdentity, client: TClient, status: 'ready' | 'degraded' | 'unavailable' }
    | { available: false, kit: KitIdentity, reason: KitUnavailableReason, error: Error }

/**
 * Defines a kit reference.
 *
 * Use when:
 * - Implementing a trusted Host-provided Kit API surface
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
  kit: KitIdentity,
  reason: KitUnavailableReason,
  detail?: string,
): Extract<KitUseResult<TClient>, { ok: false }> {
  return {
    ok: false,
    reason,
    error: new KitUnavailableError(kit.id, reason, detail),
  }
}

export type { Disposable }

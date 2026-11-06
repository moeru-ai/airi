import type { ModulePermissionDeclaration, ModulePermissionGrant } from '@proj-airi/plugin-protocol/types'

import type { ExposePolicy } from '../../kit'
import type { KitCallContext } from '../../kit/contract'
import type { KitUnavailableReason } from '../../kit/ref'
import type { ExtensionInfo, KitProviderInfo, KitStatus, NormalizedKitUse } from '../../kit/references'
import type { ExtensionProvidedKitDeclaration } from '../shared/types'

/**
 * The ports between the Host and a plugin runtime.
 *
 * The Host side implements {@link HostPort}. The plugin side implements {@link PluginEndpoint}.
 * A direct runner passes both objects in one thread. The worker bridge carries each method as one eventa invoke.
 */

/** One Kit that a session or a module depends on, as the plugin side sees it. */
export interface KitSnapshot {
  readonly id: string
  readonly version: string
  readonly provider: KitProviderInfo
  readonly status: KitStatus
  readonly instanceId?: string
  /** The client value. Only a direct runner sends it. Over the bridge, the plugin side calls `callKit`. */
  readonly value?: unknown
}

/** The Kits and plugins that a plugin can see. */
export interface CatalogSnapshot {
  readonly kits: readonly {
    readonly id: string
    readonly version: string
    readonly provider: KitProviderInfo
    readonly status: KitStatus
  }[]
  readonly extensions: readonly ExtensionInfo[]
}

/** The identity of one plugin session. */
export interface SessionIdentity {
  readonly id: string
  readonly version?: string
  readonly sessionId: string
}

/** The start of one setup round. One round is one instance of the session service. */
export interface RoundStartInput {
  readonly round: string
  readonly identity: SessionIdentity
  readonly kits: readonly KitSnapshot[]
  readonly catalog: CatalogSnapshot
  /** The Kits that the Manifest declares as provided. The plugin side checks each provide against them. */
  readonly provides: readonly ExtensionProvidedKitDeclaration[]
}

/** A Kit that the plugin side announces during setup. */
export interface ProvideAnnounceInput {
  readonly round: string
  readonly kitId: string
  readonly version: string
  readonly allowedExposePolicies: readonly ExposePolicy[]
  readonly methods: readonly string[]
}

/** The scope of a Kit call. Without `scope`, the call uses the session scope. */
export interface KitScopeInput {
  readonly round: string
  /** The id of a module scope from `registerScope`. */
  readonly scope?: string
  readonly kitId: string
}

/** A Kit request with a version range. */
export interface KitRequestInput extends KitScopeInput {
  readonly range: string
}

export type TryUseResult
  = | { readonly ok: true, readonly kit: KitSnapshot }
    | { readonly ok: false, readonly reason: KitUnavailableReason, readonly detail?: string }

/** One availability change for `ctx.kits.watch()`. */
export type WatchUpdate
  = | { readonly available: true, readonly kit: KitSnapshot }
    | { readonly available: false, readonly reason: KitUnavailableReason, readonly detail?: string }

/** The calls from the plugin side to the Host. */
export interface HostPort {
  /** Announces one provided Kit (id, version, methods). The Host checks the Manifest and adds it to the setup transaction. */
  provide: (input: ProvideAnnounceInput) => Promise<{ handle: string }>
  /** Withdraws one announced Kit. A stale handle resolves `false`. */
  withdrawProvide: (input: { round: string, handle: string }) => Promise<boolean>
  /** Reports the status of one provided Kit, with a cause chain. */
  setStatus: (input: { round: string, kitId: string, status: KitStatus, reason?: string, cause?: { key: string, status: KitStatus, reason?: string } }) => Promise<void>
  /** Calls one method of a Kit client. The Host adds the caller identity. Used over the bridge only. */
  callKit: (input: KitScopeInput & { method: string, args: readonly unknown[] }) => Promise<unknown>
  /** Returns a Kit. In the session scope, a Kit that is not a dependency starts a rebuild. */
  useKit: (input: KitRequestInput) => Promise<KitSnapshot>
  /** Resolves a Kit now without a rebuild. */
  tryUseKit: (input: KitRequestInput) => Promise<TryUseResult>
  /** Watches a Kit. Resolves with the function that ends the watch. */
  watchKit: (input: KitRequestInput & { callback: (update: WatchUpdate) => void | Promise<void> }) => Promise<() => Promise<void>>
  /** Rebuilds the session with new dynamic Kit uses. */
  rebuild: (input: { round: string, uses: readonly NormalizedKitUse[] }) => Promise<{ phase: 'setup' | 'running' }>
  /** Adds or replaces one dynamic module. Resolves when the module runs. */
  upsertModule: (input: { round: string, moduleId: string, revision: number, kits: readonly NormalizedKitUse[], timeoutMs: number }) => Promise<void>
  /** Creates one module scope for `ctx.modules.register()`. */
  registerScope: (input: { round: string, moduleId: string, permissions?: ModulePermissionDeclaration, labels?: Record<string, string> }) => Promise<{ scope: string, permissions: ModulePermissionGrant }>
  /** Disposes one module scope and the Host resources that it owns. */
  disposeScope: (input: { round: string, scope: string }) => Promise<void>
  /** Stops the session. A call from the cleanup of `round` resolves at once, and the stop continues. */
  stopSession: (input: { round: string }) => Promise<void>
}

/** The calls from the Host to the plugin side. */
export interface PluginEndpoint {
  /** Checks that the entrypoint loads and that its id matches the Manifest. */
  load: (input: { manifestId: string }) => Promise<void>
  /** Runs setup for one round. Resolves when setup returns. */
  startRound: (input: RoundStartInput) => Promise<void>
  /** Ends one round that has not completed setup. Later calls from the round fail. */
  abortRound: (input: { round: string, reason: string }) => Promise<void>
  /** Runs the cleanup of one round: module scopes first, then the root subscriptions. */
  stopRound: (input: { round: string }) => Promise<void>
  /** Sends the new Kit dependencies of a round after a dependency change. */
  updateKits: (input: { round: string, kits: readonly KitSnapshot[] }) => Promise<void>
  /** Sends the Kits and plugins that the plugin can see. */
  updateCatalog: (input: { catalog: CatalogSnapshot }) => Promise<void>
  /** Runs the setup of one revision of a dynamic module. */
  startModule: (input: { round: string, moduleId: string, revision: number, kits: readonly KitSnapshot[] }) => Promise<void>
  /** Runs the cleanup of one revision of a dynamic module. */
  stopModule: (input: { moduleId: string, revision: number }) => Promise<void>
  /** Forgets one revision of a dynamic module that did not start, for example after a timeout. */
  dropModule: (input: { moduleId: string, revision: number }) => Promise<void>
  /** Calls one method of a provided Kit. The Host injects the caller identity. */
  invokeProvider: (input: { round: string, kitId: string, method: string, input: unknown, caller: KitCallContext }) => Promise<unknown>
}

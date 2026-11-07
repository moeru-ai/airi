import type {
  ExtensionIdentity,
  ExtensionModuleIdentity,
  ModulePermissionDeclaration,
  ModulePermissionGrant,
} from '@proj-airi/plugin-protocol/types'

import type {
  ExtensionInfo,
  KitAvailability,
  KitClientOf,
  KitContract,
  KitInfo,
  KitProvider,
  KitProviderHandle,
  KitReference,
  KitUse,
  KitUseResult,
  OptionalKitUse,
  RangedKitUse,
  RebuildDecision,
} from '../kit'
import type { Disposable, DisposableStore, DisposeOptions } from './disposable'

/**
 * Describes an optional advanced lifecycle/attribution scope inside an extension session.
 */
export interface RegisterExtensionModuleInput {
  /** Stable module id within the current extension session. */
  id: string
  /**
   * Runtime permissions this module actually intends to use.
   *
   * The host intersects these requests with the extension manifest grant, so a
   * module can never widen access beyond the package/session-level ceiling.
   */
  permissions?: ModulePermissionDeclaration
  /** Optional labels used for routing, policy, and inspection. */
  labels?: Record<string, string>
}

/**
 * Kit operations that wait for the Host. A module scope has only these operations.
 */
export interface ExtensionKitConsumer {
  /**
   * Returns the client of a Kit.
   *
   * In root setup, a Kit that the session does not depend on starts a rebuild with the Kit added, and the current setup round ends.
   * In a module scope, it resolves the Kit now and throws `KitUnavailableError` when the Kit is not available.
   */
  use: <R extends KitReference>(kit: R | RangedKitUse<R>) => Promise<KitClientOf<R>>
  /** Resolves a Kit now without a rebuild. A failure gives a typed reason. */
  tryUse: <R extends KitReference>(kit: R | RangedKitUse<R>) => Promise<KitUseResult<KitClientOf<R>>>
  /** Calls `callback` with the current availability of a Kit and with each change. */
  watch: <R extends KitReference>(
    kit: R | RangedKitUse<R>,
    callback: (availability: KitAvailability<KitClientOf<R>>) => void | Promise<void>,
  ) => Disposable
}

/** Reads the Kits that a session or a module depends on. The Host resolved them before setup started. */
export interface ExtensionKitReader {
  /** Returns `true` when the Kit is a dependency and its provider is available now. */
  has: (kit: KitUse) => boolean
  /**
   * Returns the client of a dependency. The type follows the reference.
   * A required Kit that is not a dependency throws `KitUnavailableError`. An optional use gives `undefined` when no provider runs.
   */
  get: (<R extends KitReference>(kit: R | RangedKitUse<R>) => KitClientOf<R>)
    & (<R extends KitReference>(kit: OptionalKitUse<R>) => KitClientOf<R> | undefined)
}

/** Root setup can consume Kits, find Kits, and provide Kits declared by its Manifest. Module scopes only consume Kits. */
export interface ExtensionKitRegistry extends ExtensionKitConsumer, ExtensionKitReader {
  /**
   * Lists the Kit providers that the plugin has permission to see.
   * In the filter, `id` selects one Kit, and `range` keeps the providers whose version is in the range.
   */
  find: (filter?: { id?: string, range?: string }) => readonly KitInfo[]
  /**
   * Fills one Provider reservation in the current Extension setup transaction.
   * The Provider remains pending until the Host commits the complete transaction.
   *
   * @param contract Contract identity and member definitions.
   * @param provider Exact method handlers accepted for this registration.
   */
  provide: <TContract extends KitContract>(contract: TContract, provider: KitProvider<TContract>) => KitProviderHandle
}

/**
 * Runtime context returned from module registration.
 */
export interface ExtensionModuleContext {
  /** Stable module id within the current extension session. */
  id: string
  /** Protocol identity for this module. */
  identity: ExtensionModuleIdentity
  /** Effective grant after applying the extension-level permission ceiling. */
  permissions: ModulePermissionGrant
  /** Module-scoped kit access for attribution and optional lifecycle cleanup. */
  kits: ExtensionKitConsumer
  /** Cleanup callbacks owned by this module. */
  subscriptions: DisposableStore
  /** Disposes module-owned resources. Each callback gets `options`. The first call decides them. */
  dispose: (options?: DisposeOptions) => Promise<void>
}

/**
 * Narrow module reference exposed to extension authors.
 */
export interface ExtensionModuleRef {
  /** Stable module id within the current extension session. */
  id: string
  /** Module-scoped kit access for attribution and optional lifecycle cleanup. */
  kits: ExtensionKitConsumer
  /** Cleanup callbacks owned by this module. */
  subscriptions: DisposableStore
  /** Disposes module-owned resources. Each callback gets `options`. The first call decides them. */
  dispose: (options?: DisposeOptions) => Promise<void>
}

/** A side effect that returns its cleanup. A Host cleanup gives its stop signal to the cleanup. */
export type ExtensionEffect = () => ((options: DisposeOptions) => void | Promise<void>) | void

/** The context of one run of a dynamic module setup. */
export interface ExtensionDynamicModuleContext {
  /** Stable module id within the plugin. */
  id: string
  /** The Kits of this module. The Host resolved them before setup started. */
  kits: ExtensionKitReader
  /** Cleanup callbacks of this run. They run when a newer run replaces it, or when the module stops. */
  subscriptions: DisposableStore
  /** Runs a side effect and stores its cleanup with this run. */
  effect: (setup: ExtensionEffect) => void
}

/** The options of `ctx.modules.upsert()`. */
export interface ExtensionModuleUpsertOptions {
  /** The Kits that this module uses. The Host runs `setup` only when each required Kit is available. */
  kits: readonly KitUse[]
  /** Runs the module. A newer upsert of the same id replaces it after the newer setup runs. */
  setup: (module: ExtensionDynamicModuleContext) => void | Promise<void>
  /** How long to wait for the Kits. After it, `upsert` rejects and the old module stays. @default 10_000 */
  timeoutMs?: number
}

/**
 * Optional module scope API exposed during extension setup.
 *
 * Modules are not required for basic kit usage. Use them when a host needs a
 * contribution to have its own cleanup, inspection, or future restart boundary.
 */
export interface ExtensionModuleRegistry {
  /** Registers a module scope with its own permissions and cleanup. */
  register: (input: RegisterExtensionModuleInput) => Promise<ExtensionModuleContext>
  /**
   * Adds or replaces a module that has its own Kit dependencies, for example a script that an agent writes at run time.
   *
   * - The first upsert of an id adds the module. A later upsert replaces it, and the old module serves until the new one runs.
   * - When a required Kit is not available before `timeoutMs`, it rejects with the explanation, and the old module stays.
   * - A newer upsert of the same id cancels an earlier one that is not complete.
   */
  upsert: (id: string, options: ExtensionModuleUpsertOptions) => Promise<void>
}

/** Rebuild operations of the current session. */
export interface ExtensionSelf {
  /**
   * Replaces the dynamic Kit dependencies of the session and rebuilds it.
   *
   * During setup, the current setup round ends, and a new round starts when the new Kits are available.
   * After setup, the old session serves until the new session runs. The worker does not restart.
   */
  rebuild: (options: { uses: readonly KitUse[] }) => RebuildDecision
  /**
   * Stops this session. The Host withdraws its Kits and runs its cleanup.
   *
   * A cleanup of this session passes the `signal` that it got. Then the call resolves at once, and the stop continues.
   * A call from a cleanup without that signal waits for the cleanup itself, until the stop timeout ends the wait.
   */
  stop: (options?: ExtensionSelfStopOptions) => Promise<void>
}

/** The options of `ctx.self.stop()`. */
export interface ExtensionSelfStopOptions {
  /**
   * The signal that a cleanup of this session got in its `DisposeOptions`. The Host then knows that the call comes from that cleanup.
   * Pass the signal as it is. A signal from `AbortSignal.any()`, or any other signal, has no effect.
   */
  signal?: AbortSignal
}

/** Reads the plugins that the plugin can see. */
export interface ExtensionDirectory {
  find: (id: string) => ExtensionInfo | undefined
}

/**
 * Host-provided setup context for one extension session.
 */
export interface ExtensionSetupContext {
  /** Current extension session identity. */
  extension: ExtensionIdentity
  /** Extension-session cleanup callbacks. They run when this setup round ends. */
  subscriptions: DisposableStore
  /** Runs a side effect and stores its cleanup with this setup round. A rebuild runs setup again, so register effects here. */
  effect: (setup: ExtensionEffect) => void
  /** Root setup can consume Kits and provide Kits declared by its Manifest. */
  kits: ExtensionKitRegistry
  /** Optional advanced lifecycle/attribution scopes and dynamic modules. */
  modules: ExtensionModuleRegistry
  /** Rebuild operations of this session. */
  self: ExtensionSelf
  /** Reads the plugins that this plugin can see. */
  extensions: ExtensionDirectory
}

/**
 * Public extension authoring contract returned by `defineExtension`.
 */
export interface Extension {
  /** Stable extension id from the manifest/package. */
  id: string
  /** Runs extension initialization. */
  setup: (ctx: ExtensionSetupContext) => Promise<void> | void
}

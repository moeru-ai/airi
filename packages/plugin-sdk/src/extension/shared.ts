import type {
  ExtensionIdentity,
  ExtensionModuleIdentity,
  ModulePermissionDeclaration,
  ModulePermissionGrant,
} from '@proj-airi/plugin-protocol/types'

import type { KitAvailability, KitRef, KitUseResult } from '../kit'
import type { Disposable, DisposableStore } from './disposable'

/**
 * Public extension authoring contract returned by `defineExtension`.
 */
export interface Extension {
  /** Stable extension id from the manifest/package. */
  id: string
  /** Runs extension initialization. */
  setup: (ctx: ExtensionSetupContext) => Promise<void> | void
  /** Optional extension package version. */
  version?: string
}

/**
 * Minimal kit client registry exposed to extension setup and optional module scopes.
 */
export interface ExtensionKitRegistry {
  tryUse: <TClient>(kit: KitRef<TClient>) => Promise<KitUseResult<TClient>>
  use: <TClient>(kit: KitRef<TClient>) => Promise<TClient>
  watch: <TClient>(
    kit: KitRef<TClient>,
    callback: (availability: KitAvailability<TClient>) => Promise<void> | void,
  ) => Disposable
}

/**
 * Runtime context returned from module registration.
 */
export interface ExtensionModuleContext {
  /** Disposes module-owned resources. */
  dispose: () => Promise<void>
  /** Stable module id within the current extension session. */
  id: string
  /** Protocol identity for this module. */
  identity: ExtensionModuleIdentity
  /** Module-scoped kit access for attribution and optional lifecycle cleanup. */
  kits: ExtensionKitRegistry
  /** Effective grant after applying the extension-level permission ceiling. */
  permissions: ModulePermissionGrant
  /** Cleanup callbacks owned by this module. */
  subscriptions: DisposableStore
}

/**
 * Narrow module reference exposed to extension authors.
 */
export interface ExtensionModuleRef {
  /** Disposes module-owned resources. */
  dispose: () => Promise<void>
  /** Stable module id within the current extension session. */
  id: string
  /** Module-scoped kit access for attribution and optional lifecycle cleanup. */
  kits: ExtensionKitRegistry
  /** Cleanup callbacks owned by this module. */
  subscriptions: DisposableStore
}

/**
 * Optional module scope API exposed during extension setup.
 *
 * Modules are not required for basic kit usage. Use them when a host needs a
 * contribution to have its own cleanup, inspection, or future restart boundary.
 */
export interface ExtensionModuleRegistry {
  register: (input: RegisterExtensionModuleInput) => Promise<ExtensionModuleContext>
}

/**
 * Host-provided setup context for one extension session.
 */
export interface ExtensionSetupContext {
  /** Current extension session identity. */
  extension: ExtensionIdentity
  /** Extension-scoped kit access for the common authoring path. */
  kits: ExtensionKitRegistry
  /** Optional advanced lifecycle/attribution scopes. */
  modules: ExtensionModuleRegistry
  /** Extension-session cleanup callbacks. */
  subscriptions: DisposableStore
}

/**
 * Describes an optional advanced lifecycle/attribution scope inside an extension session.
 */
export interface RegisterExtensionModuleInput {
  /** Stable module id within the current extension session. */
  id: string
  /** Optional labels used for routing, policy, and inspection. */
  labels?: Record<string, string>
  /**
   * Runtime permissions this module actually intends to use.
   *
   * The host intersects these requests with the extension manifest grant, so a
   * module can never widen access beyond the package/session-level ceiling.
   */
  permissions?: ModulePermissionDeclaration
}
